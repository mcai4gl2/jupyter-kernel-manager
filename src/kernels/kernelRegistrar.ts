import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { KernelDefinition, resolveKernelsDir } from '../config/kernelConfig';
import { getJupyterDataDir, getVenvPythonPath, isVenvValid, isWindows, isWindowsStorePython, removeDirectorySafely } from '../platform/platform';
import { run } from '../platform/subprocess';
import { getOutputChannel } from '../extension';

/**
 * Returns the configurable kernel name prefix (e.g., "py-learn").
 */
function getKernelPrefix(): string {
  return vscode.workspace.getConfiguration('jupyterKernelManager').get<string>('kernelPrefix', 'py-learn');
}

/**
 * Builds the Jupyter kernelspec name for a kernel (+ optional variant).
 * Example: "py-learn-common" or "py-learn-pytorch_study-gpu"
 */
export function getKernelSpecName(kernelName: string, variant?: string): string {
  const prefix = getKernelPrefix();
  if (variant) {
    return `${prefix}-${kernelName}-${variant}`;
  }
  return `${prefix}-${kernelName}`;
}

/**
 * Returns the directory where Jupyter kernelspecs should be written.
 * On Windows: `%APPDATA%/jupyter/kernels`
 * On macOS:   `~/Library/Jupyter/kernels`
 * On Linux:   `~/.local/share/jupyter/kernels`
 */
export function getKernelSpecsDir(): string {
  return path.join(getJupyterDataDir(), 'kernels');
}

// ----- kernel.json spec content -----

interface KernelSpec {
  argv: string[];
  display_name: string;
  language: string;
  metadata?: Record<string, unknown>;
  env?: Record<string, string>;
}

function buildKernelSpec(
  pythonPath: string,
  displayName: string,
  env?: Record<string, string>,
): KernelSpec {
  return {
    argv: [pythonPath, '-m', 'ipykernel_launcher', '-f', '{connection_file}'],
    display_name: displayName,
    language: 'python',
    metadata: { debugger: true },
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
  };
}

// ----- Registration -----

export interface RegistrationResult {
  success: boolean;
  kernelName: string;
  specName: string;
  message: string;
}

/**
 * Registers a single kernel as a Jupyter kernelspec by writing
 * the kernel.json spec file to the Jupyter data directory.
 *
 * On Windows, also copies to AppData for Jupyter visibility
 * (handles sandboxed Python via robocopy fallback).
 */
export async function registerKernel(
  kernelName: string,
  definition: KernelDefinition,
  variant?: string,
): Promise<RegistrationResult> {
  const outputChannel = getOutputChannel();
  const specName = getKernelSpecName(kernelName, variant);

  // Resolve display name (variant may override)
  let displayName = definition.display_name;
  if (variant && definition.variants?.[variant]?.display_name) {
    displayName = definition.variants[variant].display_name!;
  }

  // Resolve venv python path
  const kernelsDir = resolveKernelsDir();
  if (!kernelsDir) {
    return { success: false, kernelName, specName, message: 'No workspace folder open' };
  }

  const venvDir = path.join(kernelsDir, kernelName, '.venv');
  const pythonPath = getVenvPythonPath(venvDir);

  if (!await isVenvValid(venvDir)) {
    return {
      success: false, kernelName, specName,
      message: `Venv not found — run "Setup Kernel" first`,
    };
  }

  outputChannel.appendLine(`Registering kernel: ${displayName} (${specName})`);

  // Build spec
  const spec = buildKernelSpec(pythonPath, displayName, definition.env);

  // Write to Jupyter kernels directory
  const kernelSpecsDir = getKernelSpecsDir();
  const specDir = path.join(kernelSpecsDir, specName);

  try {
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(
      path.join(specDir, 'kernel.json'),
      JSON.stringify(spec, null, 2),
      'utf-8'
    );
    outputChannel.appendLine(`  Written to: ${specDir}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`  Failed to write kernelspec: ${msg}`);
    return { success: false, kernelName, specName, message: `Failed to write spec: ${msg}` };
  }

  // On Windows: also write to project-local location for VS Code
  if (isWindows()) {
    await writeWindowsProjectLocal(specName, spec, kernelsDir, outputChannel);
  }

  outputChannel.appendLine(`  Registered: ${displayName}`);
  return { success: true, kernelName, specName, message: 'Registered' };
}

/**
 * Registers all kernels from the config.
 */
export async function registerAllKernels(
  kernels: Record<string, KernelDefinition>,
  token?: vscode.CancellationToken,
): Promise<RegistrationResult[]> {
  const results: RegistrationResult[] = [];

  for (const [name, definition] of Object.entries(kernels)) {
    if (token?.isCancellationRequested) {
      results.push({ success: false, kernelName: name, specName: '', message: 'Cancelled' });
      break;
    }
    const result = await registerKernel(name, definition);
    results.push(result);
  }

  return results;
}

// ----- Unregistration -----

/**
 * Unregisters a kernel by deleting its kernelspec directory.
 */
export async function unregisterKernel(
  kernelName: string,
  variant?: string,
): Promise<{ success: boolean; message: string }> {
  const outputChannel = getOutputChannel();
  const specName = getKernelSpecName(kernelName, variant);

  outputChannel.appendLine(`Unregistering kernel: ${specName}`);

  const specDir = path.join(getKernelSpecsDir(), specName);

  try {
    await fs.access(specDir);
  } catch {
    return { success: false, message: `Kernelspec not found: ${specName}` };
  }

  try {
    await removeDirectorySafely(specDir);
    outputChannel.appendLine(`  Removed: ${specDir}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`  Failed to remove: ${msg}`);
    return { success: false, message: `Failed to remove: ${msg}` };
  }

  // On Windows: also remove from project-local location
  if (isWindows()) {
    const kernelsDir = resolveKernelsDir();
    if (kernelsDir) {
      const workspaceRoot = path.dirname(kernelsDir);
      const localSpecDir = path.join(workspaceRoot, '.venv', 'share', 'jupyter', 'kernels', specName);
      try {
        await fs.access(localSpecDir);
        await removeDirectorySafely(localSpecDir);
        outputChannel.appendLine(`  Removed project-local: ${localSpecDir}`);
      } catch {
        // Not found — that's fine
      }
    }
  }

  outputChannel.appendLine(`  Unregistered: ${specName}`);
  return { success: true, message: 'Unregistered' };
}

// ----- Query -----

/**
 * Checks whether a kernelspec is registered (its directory exists in Jupyter data).
 */
export async function isKernelRegistered(kernelName: string, variant?: string): Promise<boolean> {
  const specName = getKernelSpecName(kernelName, variant);
  const specDir = path.join(getKernelSpecsDir(), specName);
  try {
    await fs.access(path.join(specDir, 'kernel.json'));
    return true;
  } catch {
    return false;
  }
}

// ----- Windows helpers -----

/**
 * On Windows, writes the kernelspec to a project-local `.venv/share/jupyter/kernels/`
 * directory so VS Code can find it.
 *
 * For sandboxed (Windows Store) Python, uses robocopy fallback.
 */
async function writeWindowsProjectLocal(
  specName: string,
  spec: KernelSpec,
  kernelsDir: string,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const workspaceRoot = path.dirname(kernelsDir);
  const localSpecDir = path.join(workspaceRoot, '.venv', 'share', 'jupyter', 'kernels', specName);

  // Check if we need robocopy (sandboxed Python)
  const pythonPath = spec.argv[0];
  const sandboxed = await isWindowsStorePython(pythonPath);

  if (sandboxed) {
    // Write to a temp location first, then robocopy to the target
    outputChannel.appendLine('  Sandboxed Python detected — using robocopy');
    const appDataSpecDir = path.join(getKernelSpecsDir(), specName);
    try {
      const result = await run({
        command: 'robocopy',
        args: [
          appDataSpecDir, localSpecDir,
          '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
        ],
        outputChannel,
      });
      // robocopy returns 0-7 for success
      if (result.exitCode > 7) {
        outputChannel.appendLine(`  Warning: robocopy returned ${result.exitCode}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`  Warning: robocopy failed: ${msg}`);
    }
  } else {
    // Write directly
    try {
      await fs.mkdir(localSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(localSpecDir, 'kernel.json'),
        JSON.stringify(spec, null, 2),
        'utf-8'
      );
      outputChannel.appendLine(`  Project-local: ${localSpecDir}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`  Warning: could not write project-local spec: ${msg}`);
    }
  }
}
