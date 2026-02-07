import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { KernelsConfig, resolveKernelsDir, loadKernelsConfig } from '../config/kernelConfig';
import { getVenvPythonPath, isVenvValid, isWindows, isWindowsStorePython, getJupyterDataDir } from '../platform/platform';
import { run } from '../platform/subprocess';
import { checkFreshness } from '../venv/hashTracker';
import { getKernelSpecName, getKernelSpecsDir, isKernelRegistered } from './kernelRegistrar';
import { getOutputChannel } from '../extension';

/**
 * Runs a full diagnostic check on all kernels and outputs the results
 * to the Jupyter Kernel Manager output channel.
 */
export async function runDiagnostics(): Promise<void> {
  const out = getOutputChannel();
  out.show(true);
  out.appendLine('');
  out.appendLine('='.repeat(60));
  out.appendLine('Jupyter Kernel Manager — Diagnostics');
  out.appendLine('='.repeat(60));

  await checkPythonEnvironment(out);
  await checkJupyterDataDir(out);
  await checkKernelSetup(out);
  await checkRegisteredKernelSpecs(out);
  printRecommendations(out);

  out.appendLine('');
  out.appendLine('='.repeat(60));
  out.appendLine('Diagnostics complete.');
  out.appendLine('='.repeat(60));
}

// ----- Individual checks -----

async function checkPythonEnvironment(out: vscode.OutputChannel): Promise<void> {
  out.appendLine('');
  out.appendLine('[Python Environment]');

  const pythonCmd = isWindows() ? 'python' : 'python3';
  try {
    const result = await run({
      command: pythonCmd,
      args: ['--version'],
    });
    if (result.exitCode === 0) {
      out.appendLine(`  System Python: ${result.stdout.trim() || result.stderr.trim()}`);
    } else {
      out.appendLine(`  WARNING: "${pythonCmd}" returned exit code ${result.exitCode}`);
    }
  } catch {
    out.appendLine(`  ERROR: "${pythonCmd}" not found on PATH`);
  }

  if (isWindows()) {
    try {
      const sandboxed = await isWindowsStorePython(pythonCmd);
      if (sandboxed) {
        out.appendLine('  WARNING: Windows Store Python detected (sandboxed)');
        out.appendLine('  Files written to AppData may be redirected to sandbox location');
      } else {
        out.appendLine('  Standard Python install (not sandboxed)');
      }
    } catch {
      // Skip sandbox check if it fails
    }
  }
}

async function checkJupyterDataDir(out: vscode.OutputChannel): Promise<void> {
  out.appendLine('');
  out.appendLine('[Jupyter Data Directory]');

  const dataDir = getJupyterDataDir();
  out.appendLine(`  Path: ${dataDir}`);

  const specsDir = getKernelSpecsDir();
  try {
    await fs.access(specsDir);
    out.appendLine(`  Kernels dir exists: ${specsDir}`);
  } catch {
    out.appendLine(`  Kernels dir NOT found: ${specsDir}`);
  }
}

async function checkKernelSetup(out: vscode.OutputChannel): Promise<void> {
  out.appendLine('');
  out.appendLine('[Kernel Setup Status]');

  const configResult = await loadKernelsConfig();
  if (!configResult.config) {
    out.appendLine(`  ERROR: Cannot load config — ${configResult.error}`);
    return;
  }

  const kernelsDir = resolveKernelsDir();
  if (!kernelsDir) {
    out.appendLine('  ERROR: No workspace folder open');
    return;
  }

  const kernels = configResult.config.kernels;
  for (const [name, def] of Object.entries(kernels)) {
    out.appendLine('');
    out.appendLine(`  Kernel: ${name} (${def.display_name})`);

    const kernelDir = path.join(kernelsDir, name);
    const venvDir = path.join(kernelDir, '.venv');
    const reqFile = def.requirements_file ?? 'requirements.txt';
    const reqPath = path.join(kernelDir, reqFile);

    // Check kernel directory
    try {
      await fs.access(kernelDir);
    } catch {
      out.appendLine(`    Directory: MISSING (${kernelDir})`);
      continue;
    }
    out.appendLine(`    Directory: OK`);

    // Check venv
    const valid = await isVenvValid(venvDir);
    if (valid) {
      out.appendLine(`    Venv: OK`);

      // Check python version in venv
      const pythonPath = getVenvPythonPath(venvDir);
      try {
        const verResult = await run({ command: pythonPath, args: ['--version'] });
        if (verResult.exitCode === 0) {
          out.appendLine(`    Python: ${verResult.stdout.trim() || verResult.stderr.trim()}`);
        }
      } catch {
        out.appendLine(`    Python: ERROR (cannot execute)`);
      }

      // Check ipykernel
      try {
        const ipykResult = await run({
          command: pythonPath,
          args: ['-c', 'import ipykernel; print(ipykernel.__version__)'],
        });
        if (ipykResult.exitCode === 0) {
          out.appendLine(`    ipykernel: ${ipykResult.stdout.trim()}`);
        } else {
          out.appendLine(`    ipykernel: NOT INSTALLED`);
          out.appendLine(`      Fix: activate venv and run "pip install ipykernel"`);
        }
      } catch {
        out.appendLine(`    ipykernel: NOT INSTALLED`);
      }

      // Check hash freshness
      const freshness = await checkFreshness(venvDir, reqPath);
      if (freshness.upToDate) {
        out.appendLine(`    Requirements: Up to date (${freshness.currentHash.slice(0, 8)})`);
      } else if (freshness.storedHash) {
        out.appendLine(`    Requirements: CHANGED (stored: ${freshness.storedHash.slice(0, 8)}, current: ${freshness.currentHash.slice(0, 8)})`);
      } else {
        out.appendLine(`    Requirements: No hash marker (needs setup)`);
      }
    } else {
      // Check if dir exists but is broken
      try {
        await fs.access(venvDir);
        out.appendLine(`    Venv: BROKEN (directory exists but no valid Python)`);
      } catch {
        out.appendLine(`    Venv: NOT SET UP`);
      }
    }

    // Check registration
    const registered = await isKernelRegistered(name);
    const specName = getKernelSpecName(name);
    if (registered) {
      out.appendLine(`    Registered: YES (${specName})`);
    } else {
      out.appendLine(`    Registered: NO`);
    }

    // Check variants
    if (def.variants) {
      for (const vName of Object.keys(def.variants)) {
        const vRegistered = await isKernelRegistered(name, vName);
        const vSpecName = getKernelSpecName(name, vName);
        out.appendLine(`    Variant "${vName}": ${vRegistered ? 'Registered' : 'Not registered'} (${vSpecName})`);
      }
    }
  }
}

async function checkRegisteredKernelSpecs(out: vscode.OutputChannel): Promise<void> {
  out.appendLine('');
  out.appendLine('[Registered Jupyter Kernelspecs]');

  const specsDir = getKernelSpecsDir();
  let entries: string[];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    out.appendLine(`  No kernelspecs directory found at: ${specsDir}`);
    return;
  }

  if (entries.length === 0) {
    out.appendLine('  No kernelspecs registered');
    return;
  }

  for (const entry of entries.sort()) {
    const specFile = path.join(specsDir, entry, 'kernel.json');
    try {
      const content = await fs.readFile(specFile, 'utf-8');
      const spec = JSON.parse(content);
      const pythonPath = spec.argv?.[0] ?? '(unknown)';
      const displayName = spec.display_name ?? entry;

      // Check if the Python executable exists
      let pythonOk = false;
      try {
        await fs.access(pythonPath);
        pythonOk = true;
      } catch {
        // Python path doesn't exist
      }

      const status = pythonOk ? 'OK' : 'BROKEN (Python not found)';
      out.appendLine(`  ${entry}: ${displayName} [${status}]`);
      out.appendLine(`    Python: ${pythonPath}`);
    } catch {
      out.appendLine(`  ${entry}: (invalid or unreadable kernel.json)`);
    }
  }
}

function printRecommendations(out: vscode.OutputChannel): void {
  out.appendLine('');
  out.appendLine('[Recommendations]');
  out.appendLine('  1. Restart VS Code after registering kernels');
  out.appendLine('  2. Ensure the "Jupyter" VS Code extension is installed');
  out.appendLine('  3. In a notebook, click "Select Kernel" and look for your registered kernels');
  out.appendLine('  4. Run "Setup Kernel" for any kernels marked as NOT SET UP');
  out.appendLine('  5. Run "Register Kernel" for any kernels marked as NOT registered');

  if (isWindows()) {
    out.appendLine('');
    out.appendLine('  Windows notes:');
    out.appendLine('  - Kernels are registered to %APPDATA%\\jupyter\\kernels\\');
    out.appendLine('  - Project-local copies are also placed in .venv\\share\\jupyter\\kernels\\');
  }
}
