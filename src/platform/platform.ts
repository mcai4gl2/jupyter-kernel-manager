import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Returns true if the current OS is Windows.
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Returns the Python executable path inside a venv directory.
 */
export function getVenvPythonPath(venvDir: string): string {
  if (isWindows()) {
    return path.join(venvDir, 'Scripts', 'python.exe');
  }
  return path.join(venvDir, 'bin', 'python');
}

/**
 * Returns the pip executable path inside a venv directory.
 */
export function getVenvPipPath(venvDir: string): string {
  if (isWindows()) {
    return path.join(venvDir, 'Scripts', 'pip.exe');
  }
  return path.join(venvDir, 'bin', 'pip');
}

/**
 * Resolves the system Python command to use.
 * Checks the extension setting first, then falls back to platform defaults.
 */
export function getSystemPythonCommand(): string {
  const configured = vscode.workspace.getConfiguration('jupyterKernelManager').get<string>('pythonPath', '');
  if (configured) {
    return configured;
  }
  // On Windows, `python` is the standard command; on Unix, `python3`
  return isWindows() ? 'python' : 'python3';
}

/**
 * Checks whether a venv has a valid structure (python executable exists).
 */
export async function isVenvValid(venvDir: string): Promise<boolean> {
  try {
    await fs.access(getVenvPythonPath(venvDir));
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the Jupyter data directory for the current platform.
 * Used for kernelspec registration in Phase 3.
 */
export function getJupyterDataDir(): string {
  if (isWindows()) {
    const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming');
    return path.join(appData, 'jupyter');
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME ?? '', 'Library', 'Jupyter');
  }
  // Linux / other: XDG_DATA_HOME or ~/.local/share/jupyter
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? '', '.local', 'share');
  return path.join(dataHome, 'jupyter');
}

/**
 * Detects whether the given Python executable is a Windows Store (sandboxed) install.
 * Windows Store Python lives under WindowsApps and has restricted file I/O.
 */
export async function isWindowsStorePython(pythonPath: string): Promise<boolean> {
  if (!isWindows()) {
    return false;
  }
  try {
    const resolved = await fs.realpath(pythonPath);
    return resolved.toLowerCase().includes('windowsapps');
  } catch {
    return false;
  }
}

/**
 * Safely removes a directory tree, handling Windows read-only files.
 */
export async function removeDirectorySafely(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}
