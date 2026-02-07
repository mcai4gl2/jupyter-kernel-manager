import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { KernelTreeDataProvider } from './treeView';
import { resolveConfigFilePath } from '../config/kernelConfig';

// Starter template content for kernels.json
const KERNELS_TEMPLATE = `{
  "kernels": {
    "default": {
      "display_name": "Python (Default)",
      "description": "Default kernel with common packages"
    }
  }
}
`;

/**
 * Registers all Phase 1 commands.
 * Later phases will add setup, register, diagnostics commands here.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: KernelTreeDataProvider
): void {
  // ----- Initialize Kernel Config -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.initConfig', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const configPath = resolveConfigFilePath();
      if (!configPath) {
        return;
      }

      // Check if file already exists
      try {
        await fs.access(configPath);
        const overwrite = await vscode.window.showWarningMessage(
          'kernels.json already exists. Overwrite?',
          'Overwrite',
          'Cancel'
        );
        if (overwrite !== 'Overwrite') {
          return;
        }
      } catch {
        // File doesn't exist, which is expected
      }

      // Create kernels directory
      const kernelsDir = path.join(workspaceFolder.uri.fsPath, 'kernels', 'default');
      await fs.mkdir(kernelsDir, { recursive: true });

      // Create a default requirements.txt
      const reqPath = path.join(kernelsDir, 'requirements.txt');
      try {
        await fs.access(reqPath);
      } catch {
        await fs.writeFile(reqPath, '# Add your Python package requirements here\n', 'utf-8');
      }

      // Write the config file
      await fs.writeFile(configPath, KERNELS_TEMPLATE, 'utf-8');

      // Open the created file
      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage('Kernel config initialized. Edit kernels.json to define your kernels.');
      await treeDataProvider.refresh();
    })
  );

  // ----- Edit Kernel Config -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.editConfig', async () => {
      const configPath = resolveConfigFilePath();
      if (!configPath) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      try {
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc);
      } catch {
        const create = await vscode.window.showWarningMessage(
          'kernels.json not found. Create one?',
          'Create',
          'Cancel'
        );
        if (create === 'Create') {
          await vscode.commands.executeCommand('jupyterKernelManager.initConfig');
        }
      }
    })
  );

  // ----- Refresh -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.refresh', async () => {
      await treeDataProvider.refresh();
    })
  );

  // ----- Placeholder commands for Phase 2+ (show "coming soon" message) -----
  const placeholderCommands = [
    'jupyterKernelManager.setupAllKernels',
    'jupyterKernelManager.setupKernel',
    'jupyterKernelManager.forceRecreateKernel',
    'jupyterKernelManager.registerAllKernels',
    'jupyterKernelManager.registerKernel',
    'jupyterKernelManager.unregisterKernel',
    'jupyterKernelManager.checkHealth',
    'jupyterKernelManager.updateNotebookKernels',
    'jupyterKernelManager.updateNotebookKernelsDryRun',
    'jupyterKernelManager.openKernelShell',
    'jupyterKernelManager.addNewKernel',
  ];

  for (const cmd of placeholderCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, () => {
        vscode.window.showInformationMessage('This feature will be available in a future update.');
      })
    );
  }
}
