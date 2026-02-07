import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { KernelDefinition, resolveKernelsDir } from '../config/kernelConfig';
import { getSystemPythonCommand, getVenvPipPath, getVenvPythonPath, isVenvValid, isWindows, removeDirectorySafely } from '../platform/platform';
import { run } from '../platform/subprocess';
import { checkFreshness, computeFileHash, writeHash } from './hashTracker';
import { getMirrorArgs, getPreferredMirror } from './mirrorDetector';
import { getOutputChannel } from '../extension';

export interface SetupResult {
  success: boolean;
  kernelName: string;
  message: string;
}

/**
 * Resolves the absolute path to a kernel's venv directory.
 */
export function getKernelVenvPath(kernelName: string): string | undefined {
  const kernelsDir = resolveKernelsDir();
  if (!kernelsDir) { return undefined; }
  return path.join(kernelsDir, kernelName, '.venv');
}

/**
 * Resolves the absolute path to a kernel's directory (containing requirements.txt).
 */
export function getKernelDir(kernelName: string): string | undefined {
  const kernelsDir = resolveKernelsDir();
  if (!kernelsDir) { return undefined; }
  return path.join(kernelsDir, kernelName);
}

/**
 * Resolves the requirements file path for a kernel, taking variant into account.
 */
export function getRequirementsPath(
  kernelName: string,
  definition: KernelDefinition,
  variant?: string
): string | undefined {
  const kernelDir = getKernelDir(kernelName);
  if (!kernelDir) { return undefined; }

  // If variant is specified and kernel has variants, use the variant's requirements_file
  if (variant && definition.variants?.[variant]) {
    return path.join(kernelDir, definition.variants[variant].requirements_file);
  }

  // Default requirements file
  const reqFileName = definition.requirements_file ?? 'requirements.txt';
  return path.join(kernelDir, reqFileName);
}

/**
 * Creates a new virtual environment at the given path.
 */
async function createVenv(
  venvDir: string,
  outputChannel: vscode.OutputChannel,
  token?: vscode.CancellationToken,
): Promise<boolean> {
  const pythonCmd = getSystemPythonCommand();
  outputChannel.appendLine(`Creating venv at ${venvDir}...`);
  outputChannel.appendLine(`  Python command: ${pythonCmd}`);

  const result = await run({
    command: pythonCmd,
    args: ['-m', 'venv', venvDir],
    outputChannel,
    token,
  });

  if (result.exitCode !== 0) {
    outputChannel.appendLine(`  Failed to create venv (exit code ${result.exitCode})`);
    return false;
  }

  outputChannel.appendLine('  venv created successfully');
  return true;
}

/**
 * Installs packages from a requirements file into a venv.
 * Upgrades pip first, then runs pip install -r.
 */
async function installRequirements(
  venvDir: string,
  requirementsPath: string,
  outputChannel: vscode.OutputChannel,
  token?: vscode.CancellationToken,
): Promise<boolean> {
  // Check that requirements file exists
  try {
    await fs.access(requirementsPath);
  } catch {
    outputChannel.appendLine(`  No requirements file at ${requirementsPath}, skipping install.`);
    return true;
  }

  const mirrorArgs = await getMirrorArgs();
  const mirror = await getPreferredMirror();
  if (mirror) {
    outputChannel.appendLine(`  Using PyPI mirror: ${mirror.name} (${mirror.url})`);
  }

  // Upgrade pip first
  outputChannel.appendLine('  Upgrading pip...');
  if (isWindows()) {
    // On Windows, pip must be upgraded via python -m pip
    const pythonExe = getVenvPythonPath(venvDir);
    const pipUpgrade = await run({
      command: pythonExe,
      args: ['-m', 'pip', 'install', '--upgrade', 'pip', ...mirrorArgs],
      outputChannel,
      token,
    });
    if (pipUpgrade.exitCode !== 0) {
      outputChannel.appendLine('  Warning: pip upgrade failed, continuing anyway...');
    }
  } else {
    const pipExe = getVenvPipPath(venvDir);
    const pipUpgrade = await run({
      command: pipExe,
      args: ['install', '--upgrade', 'pip', ...mirrorArgs],
      outputChannel,
      token,
    });
    if (pipUpgrade.exitCode !== 0) {
      outputChannel.appendLine('  Warning: pip upgrade failed, continuing anyway...');
    }
  }

  // Install requirements
  outputChannel.appendLine(`  Installing packages from ${path.basename(requirementsPath)}...`);
  const pipExe = getVenvPipPath(venvDir);
  const installResult = await run({
    command: pipExe,
    args: ['install', '-r', requirementsPath, ...mirrorArgs],
    outputChannel,
    token,
  });

  if (installResult.exitCode !== 0) {
    outputChannel.appendLine(`  Failed to install packages (exit code ${installResult.exitCode})`);
    return false;
  }

  outputChannel.appendLine('  Packages installed successfully');
  return true;
}

/**
 * Sets up a single kernel: creates venv if needed, installs requirements,
 * and updates the hash marker.
 *
 * @param kernelName       Name of the kernel (key in kernels.json)
 * @param definition       The kernel definition from config
 * @param force            Force recreation even if up to date
 * @param variant          Optional variant name (e.g., "gpu")
 * @param token            Cancellation token
 */
export async function setupKernel(
  kernelName: string,
  definition: KernelDefinition,
  force: boolean = false,
  variant?: string,
  token?: vscode.CancellationToken,
): Promise<SetupResult> {
  const outputChannel = getOutputChannel();
  outputChannel.show(true);
  outputChannel.appendLine('');
  outputChannel.appendLine('='.repeat(60));
  outputChannel.appendLine(`Setting up kernel: ${definition.display_name}`);
  outputChannel.appendLine('='.repeat(60));

  const venvDir = getKernelVenvPath(kernelName);
  const requirementsPath = getRequirementsPath(kernelName, definition, variant);
  const kernelDir = getKernelDir(kernelName);

  if (!venvDir || !requirementsPath || !kernelDir) {
    return { success: false, kernelName, message: 'No workspace folder open' };
  }

  // Verify kernel directory exists
  try {
    await fs.access(kernelDir);
  } catch {
    return { success: false, kernelName, message: `Kernel directory not found: ${kernelDir}` };
  }

  // Check if already up to date
  if (!force) {
    const venvExists = await isVenvValid(venvDir);
    if (venvExists) {
      const freshness = await checkFreshness(venvDir, requirementsPath);
      if (freshness.upToDate) {
        outputChannel.appendLine(`  venv is already up to date (hash: ${freshness.currentHash.slice(0, 8)})`);
        return { success: true, kernelName, message: 'Already up to date' };
      }
      outputChannel.appendLine(`  Requirements changed (stored: ${freshness.storedHash?.slice(0, 8) ?? 'none'}, current: ${freshness.currentHash.slice(0, 8)})`);
    }
  }

  // Determine if venv needs (re)creation
  const venvExists = await isVenvValid(venvDir);
  const needsRecreation = !venvExists || force;

  if (needsRecreation) {
    // Remove existing venv if present
    try {
      await fs.access(venvDir);
      if (force) {
        outputChannel.appendLine('  Force mode: removing existing venv');
      } else {
        outputChannel.appendLine('  Invalid venv detected: removing and recreating');
      }
      await removeDirectorySafely(venvDir);
    } catch {
      // Venv directory doesn't exist, which is fine
    }

    if (!await createVenv(venvDir, outputChannel, token)) {
      return { success: false, kernelName, message: 'Failed to create virtual environment' };
    }
  }

  // Compute hash BEFORE installing (snapshot approach from Python code)
  let requirementsHash = '';
  try {
    requirementsHash = await computeFileHash(requirementsPath);
  } catch {
    // No requirements file — that's okay
  }

  // Install requirements
  if (!await installRequirements(venvDir, requirementsPath, outputChannel, token)) {
    return { success: false, kernelName, message: 'Failed to install packages' };
  }

  // Update hash marker
  if (requirementsHash) {
    await writeHash(venvDir, requirementsHash);
    outputChannel.appendLine(`  Updated requirements marker (hash: ${requirementsHash.slice(0, 8)})`);
  }

  outputChannel.appendLine(`\n  venv setup complete for ${kernelName}`);
  return { success: true, kernelName, message: 'Setup complete' };
}

/**
 * Sets up all kernels from the config.
 * Returns a list of results — one per kernel.
 */
export async function setupAllKernels(
  kernels: Record<string, KernelDefinition>,
  force: boolean = false,
  token?: vscode.CancellationToken,
): Promise<SetupResult[]> {
  const results: SetupResult[] = [];
  for (const [name, definition] of Object.entries(kernels)) {
    if (token?.isCancellationRequested) {
      results.push({ success: false, kernelName: name, message: 'Cancelled' });
      break;
    }
    const result = await setupKernel(name, definition, force, undefined, token);
    results.push(result);
  }
  return results;
}
