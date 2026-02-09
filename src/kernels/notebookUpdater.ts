import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { KernelsConfig, resolveKernelsDir } from '../config/kernelConfig';
import { getKernelSpecName } from './kernelRegistrar';
import { getOutputChannel } from '../extension';

// ----- Types -----

export interface NotebookUpdateResult {
  filePath: string;
  fileName: string;
  oldKernel: string;
  newKernel: string;
  updated: boolean;
  error?: string;
}

export interface NotebookUpdateSummary {
  updated: number;
  skipped: number;
  errors: number;
  results: NotebookUpdateResult[];
}

// ----- Notebook scanning -----

/**
 * Finds all .ipynb files in the workspace, excluding common non-project dirs.
 */
async function findNotebooks(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(
    '**/*.ipynb',
    '{**/node_modules/**,**/.venv/**,**/.jupyter/**,**/kernels/**/.venv/**,**/.ipynb_checkpoints/**}',
  );
}

// ----- Kernel mapping -----

/**
 * Determines the best kernel for a notebook based on its path.
 *
 * Strategy:
 * 1. Check if any kernel name appears as a directory component in the
 *    notebook's relative path.
 * 2. Fall back to a kernel named "default" or "common", or the first kernel.
 */
export function resolveKernelForNotebook(
  notebookRelPath: string,
  kernelNames: string[],
): string | undefined {
  const pathParts = notebookRelPath.replace(/\\/g, '/').toLowerCase();

  // Check each kernel name for a match in the path
  // Sort by name length descending so more specific names match first
  // (e.g., "pytorch_study" matches before "study")
  const sorted = [...kernelNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (pathParts.includes(name.toLowerCase())) {
      return name;
    }
  }

  // Fall back to well-known defaults
  for (const fallback of ['default', 'common']) {
    if (kernelNames.includes(fallback)) {
      return fallback;
    }
  }

  // Last resort: first kernel
  return kernelNames.length > 0 ? kernelNames[0] : undefined;
}

// ----- Notebook kernel update -----

/**
 * Reads a notebook, updates its kernelspec metadata, and optionally writes it back.
 */
export async function updateSingleNotebook(
  notebookPath: string,
  kernelSpecName: string,
  displayName: string,
  dryRun: boolean,
): Promise<NotebookUpdateResult> {
  const fileName = path.basename(notebookPath);
  let content: string;

  try {
    content = await fs.readFile(notebookPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filePath: notebookPath, fileName, oldKernel: '', newKernel: kernelSpecName, updated: false, error: `Read error: ${msg}` };
  }

  let nb: Record<string, unknown>;
  try {
    nb = JSON.parse(content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filePath: notebookPath, fileName, oldKernel: '', newKernel: kernelSpecName, updated: false, error: `Parse error: ${msg}` };
  }

  // Ensure metadata.kernelspec structure exists
  if (!nb.metadata || typeof nb.metadata !== 'object') {
    nb.metadata = {};
  }
  const metadata = nb.metadata as Record<string, unknown>;
  if (!metadata.kernelspec || typeof metadata.kernelspec !== 'object') {
    metadata.kernelspec = {};
  }
  const kernelspec = metadata.kernelspec as Record<string, unknown>;

  const oldKernel = (kernelspec.name as string) ?? '';

  // No change needed
  if (oldKernel === kernelSpecName) {
    return { filePath: notebookPath, fileName, oldKernel, newKernel: kernelSpecName, updated: false };
  }

  // Update kernelspec
  kernelspec.name = kernelSpecName;
  kernelspec.display_name = displayName;
  kernelspec.language = 'python';

  if (dryRun) {
    return { filePath: notebookPath, fileName, oldKernel, newKernel: kernelSpecName, updated: true };
  }

  // Write back
  try {
    const updated = JSON.stringify(nb, null, 2) + '\n';
    await fs.writeFile(notebookPath, updated, 'utf-8');
    return { filePath: notebookPath, fileName, oldKernel, newKernel: kernelSpecName, updated: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filePath: notebookPath, fileName, oldKernel, newKernel: kernelSpecName, updated: false, error: `Write error: ${msg}` };
  }
}

// ----- Public API -----

/**
 * Scans the workspace for .ipynb notebooks and updates their kernel metadata
 * to match the appropriate kernel from kernels.json based on directory location.
 *
 * @param config  Loaded kernels config
 * @param dryRun  If true, report changes without modifying files
 * @param token   Cancellation token
 */
export async function updateNotebookKernels(
  config: KernelsConfig,
  dryRun: boolean,
  token?: vscode.CancellationToken,
): Promise<NotebookUpdateSummary> {
  const out = getOutputChannel();
  out.show(true);
  out.appendLine('');
  out.appendLine('='.repeat(60));
  out.appendLine(`Notebook Kernel Update${dryRun ? ' [DRY RUN]' : ''}`);
  out.appendLine('='.repeat(60));

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    out.appendLine('ERROR: No workspace folder open');
    return { updated: 0, skipped: 0, errors: 0, results: [] };
  }

  const kernelNames = Object.keys(config.kernels);
  if (kernelNames.length === 0) {
    out.appendLine('No kernels defined in config.');
    return { updated: 0, skipped: 0, errors: 0, results: [] };
  }

  // Find notebooks
  const notebookUris = await findNotebooks();
  if (notebookUris.length === 0) {
    out.appendLine('No .ipynb files found in workspace.');
    return { updated: 0, skipped: 0, errors: 0, results: [] };
  }

  out.appendLine(`Found ${notebookUris.length} notebook(s)`);
  out.appendLine('');

  const results: NotebookUpdateResult[] = [];
  const wsRoot = workspaceFolder.uri.fsPath;

  for (const uri of notebookUris.sort((a, b) => a.fsPath.localeCompare(b.fsPath))) {
    if (token?.isCancellationRequested) { break; }

    const relPath = path.relative(wsRoot, uri.fsPath);
    const kernelName = resolveKernelForNotebook(relPath, kernelNames);

    if (!kernelName) {
      out.appendLine(`  SKIP: ${relPath} (no matching kernel)`);
      results.push({
        filePath: uri.fsPath, fileName: path.basename(uri.fsPath),
        oldKernel: '', newKernel: '', updated: false, error: 'No matching kernel',
      });
      continue;
    }

    const definition = config.kernels[kernelName];
    const specName = getKernelSpecName(kernelName);
    const displayName = definition.display_name;

    const result = await updateSingleNotebook(uri.fsPath, specName, displayName, dryRun);
    results.push(result);

    if (result.error) {
      out.appendLine(`  ERROR: ${relPath} — ${result.error}`);
    } else if (result.updated) {
      const prefix = dryRun ? '[DRY RUN] Would update' : 'Updated';
      out.appendLine(`  ${prefix}: ${relPath}  (${result.oldKernel || '(none)'} → ${result.newKernel})`);
    } else {
      out.appendLine(`  OK: ${relPath}  (already ${result.newKernel})`);
    }
  }

  // Summary
  const updated = results.filter(r => r.updated).length;
  const skipped = results.filter(r => !r.updated && !r.error).length;
  const errors = results.filter(r => r.error).length;

  out.appendLine('');
  out.appendLine('-'.repeat(60));
  out.appendLine(`Updated: ${updated}  |  Skipped: ${skipped}  |  Errors: ${errors}`);
  if (dryRun) {
    out.appendLine('This was a dry run. Run without dry-run to apply changes.');
  }
  out.appendLine('='.repeat(60));

  return { updated, skipped, errors, results };
}
