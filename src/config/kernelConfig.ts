import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isVenvValid } from '../platform/platform';
import { checkFreshness } from '../venv/hashTracker';

// ----- TypeScript interfaces matching kernels.json schema -----

export interface KernelVariant {
  display_name?: string;
  requirements_file: string;
}

export interface KernelDefinition {
  display_name: string;
  description?: string;
  requirements_file?: string;
  python_version?: string;
  env?: Record<string, string>;
  variants?: Record<string, KernelVariant>;
}

export interface KernelsConfig {
  kernels: Record<string, KernelDefinition>;
}

// ----- Kernel status (used by tree view and other components) -----

export enum KernelStatus {
  Ready = 'ready',
  NeedsUpdate = 'needsUpdate',
  NotSetUp = 'notSetUp',
  Error = 'error',
}

export interface KernelInfo {
  name: string;
  definition: KernelDefinition;
  status: KernelStatus;
  activeVariant?: string;
  venvPath?: string;
  isRegistered?: boolean;
}

// ----- Configuration helpers -----

export function getExtensionConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('jupyterKernelManager');
}

export function getConfigPath(): string {
  return getExtensionConfig().get<string>('configPath', 'kernels.json');
}

export function getKernelsDir(): string {
  return getExtensionConfig().get<string>('kernelsDir', 'kernels');
}

export function getKernelPrefix(): string {
  return getExtensionConfig().get<string>('kernelPrefix', 'py-learn');
}

/**
 * Resolves the absolute path to kernels.json in the workspace.
 * Returns undefined if no workspace folder is open.
 */
export function resolveConfigFilePath(): string | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return path.join(workspaceFolder.uri.fsPath, getConfigPath());
}

/**
 * Resolves the absolute path to the kernels directory in the workspace.
 */
export function resolveKernelsDir(): string | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return path.join(workspaceFolder.uri.fsPath, getKernelsDir());
}

// ----- Config loading and validation -----

export interface ConfigLoadResult {
  config: KernelsConfig | null;
  error?: string;
  filePath?: string;
}

/**
 * Loads and parses kernels.json from the workspace.
 */
export async function loadKernelsConfig(): Promise<ConfigLoadResult> {
  const filePath = resolveConfigFilePath();
  if (!filePath) {
    return { config: null, error: 'No workspace folder open' };
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const validationError = validateConfig(parsed);
    if (validationError) {
      return { config: null, error: validationError, filePath };
    }
    return { config: parsed as KernelsConfig, filePath };
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { config: null, error: 'kernels.json not found', filePath };
    }
    if (err instanceof SyntaxError) {
      return { config: null, error: `Invalid JSON: ${err.message}`, filePath };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { config: null, error: `Failed to read config: ${message}`, filePath };
  }
}

/**
 * Validates the structure of a parsed kernels.json object.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateConfig(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null) {
    return 'Config must be a JSON object';
  }

  const config = obj as Record<string, unknown>;
  if (!config.kernels || typeof config.kernels !== 'object') {
    return 'Config must contain a "kernels" object';
  }

  const kernels = config.kernels as Record<string, unknown>;
  for (const [name, kernel] of Object.entries(kernels)) {
    if (typeof kernel !== 'object' || kernel === null) {
      return `Kernel "${name}" must be an object`;
    }

    const kernelObj = kernel as Record<string, unknown>;
    if (typeof kernelObj.display_name !== 'string' || !kernelObj.display_name) {
      return `Kernel "${name}" must have a non-empty "display_name" string`;
    }

    if (kernelObj.description !== undefined && typeof kernelObj.description !== 'string') {
      return `Kernel "${name}": "description" must be a string`;
    }

    if (kernelObj.requirements_file !== undefined && typeof kernelObj.requirements_file !== 'string') {
      return `Kernel "${name}": "requirements_file" must be a string`;
    }

    if (kernelObj.python_version !== undefined && typeof kernelObj.python_version !== 'string') {
      return `Kernel "${name}": "python_version" must be a string`;
    }

    if (kernelObj.env !== undefined) {
      if (typeof kernelObj.env !== 'object' || kernelObj.env === null) {
        return `Kernel "${name}": "env" must be an object`;
      }
    }

    if (kernelObj.variants !== undefined) {
      if (typeof kernelObj.variants !== 'object' || kernelObj.variants === null) {
        return `Kernel "${name}": "variants" must be an object`;
      }
      const variants = kernelObj.variants as Record<string, unknown>;
      for (const [variantName, variant] of Object.entries(variants)) {
        if (typeof variant !== 'object' || variant === null) {
          return `Kernel "${name}", variant "${variantName}" must be an object`;
        }
        const variantObj = variant as Record<string, unknown>;
        if (typeof variantObj.requirements_file !== 'string' || !variantObj.requirements_file) {
          return `Kernel "${name}", variant "${variantName}" must have a "requirements_file" string`;
        }
      }
    }
  }

  return null;
}

/**
 * Extracts a flat list of KernelInfo from a loaded config.
 * Checks venv existence and requirements hash to determine status.
 */
export async function getKernelInfoList(config: KernelsConfig): Promise<KernelInfo[]> {
  const kernelsDir = resolveKernelsDir();
  const result: KernelInfo[] = [];

  for (const [name, definition] of Object.entries(config.kernels)) {
    let status = KernelStatus.NotSetUp;
    let venvPath: string | undefined;

    if (kernelsDir) {
      venvPath = path.join(kernelsDir, name, '.venv');
      const kernelDir = path.join(kernelsDir, name);
      const reqFileName = definition.requirements_file ?? 'requirements.txt';
      const reqPath = path.join(kernelDir, reqFileName);

      const valid = await isVenvValid(venvPath);
      if (valid) {
        // Venv exists with a working python — check hash freshness
        const freshness = await checkFreshness(venvPath, reqPath);
        status = freshness.upToDate ? KernelStatus.Ready : KernelStatus.NeedsUpdate;
      } else {
        // Check if venv dir exists but is broken
        try {
          await fs.access(venvPath);
          status = KernelStatus.Error; // directory exists but no valid python
        } catch {
          status = KernelStatus.NotSetUp;
        }
      }
    }

    result.push({
      name,
      definition,
      status,
      venvPath,
    });
  }

  return result;
}

// ----- Utility -----

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
