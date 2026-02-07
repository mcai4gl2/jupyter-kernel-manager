import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { KernelTreeDataProvider, KernelTreeItem } from './treeView';
import { resolveConfigFilePath, loadKernelsConfig, KernelDefinition } from '../config/kernelConfig';
import { setupKernel } from '../venv/venvManager';
import { registerKernel, registerAllKernels, unregisterKernel } from '../kernels/kernelRegistrar';

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
 * Registers all commands.
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

  // ----- Setup All Kernels -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.setupAllKernels', async () => {
      const configResult = await loadKernelsConfig();
      if (!configResult.config) {
        vscode.window.showErrorMessage(`Cannot load config: ${configResult.error}`);
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Setting up all kernels...',
          cancellable: true,
        },
        async (progress, token) => {
          const kernels = configResult.config!.kernels;
          const names = Object.keys(kernels);
          const results = [];

          for (let i = 0; i < names.length; i++) {
            if (token.isCancellationRequested) { break; }
            const name = names[i];
            progress.report({
              message: `${name} (${i + 1}/${names.length})`,
              increment: (1 / names.length) * 100,
            });
            const result = await setupKernel(name, kernels[name], false, undefined, token);
            results.push(result);
          }

          // Auto-register successfully set up kernels
          const autoRegister = vscode.workspace.getConfiguration('jupyterKernelManager').get<boolean>('autoRegister', true);
          if (autoRegister) {
            const successfulKernels = results.filter(r => r.success);
            for (const r of successfulKernels) {
              if (token.isCancellationRequested) { break; }
              await registerKernel(r.kernelName, kernels[r.kernelName]);
            }
          }

          await treeDataProvider.refresh();

          const succeeded = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success).length;
          if (failed > 0) {
            vscode.window.showWarningMessage(
              `Kernel setup: ${succeeded} succeeded, ${failed} failed. Check Output for details.`
            );
          } else {
            const regMsg = autoRegister ? ' and registered' : '';
            vscode.window.showInformationMessage(`All ${succeeded} kernels set up${regMsg} successfully.`);
          }
        }
      );
    })
  );

  // ----- Setup Kernel... (single, with picker) -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.setupKernel', async (treeItem?: KernelTreeItem) => {
      const { kernelName, definition, variant } = await resolveKernelFromArgs(treeItem);
      if (!kernelName || !definition) { return; }

      await runSingleKernelSetup(kernelName, definition, false, variant, treeDataProvider);
    })
  );

  // ----- Force Recreate Kernel... -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.forceRecreateKernel', async (treeItem?: KernelTreeItem) => {
      const { kernelName, definition, variant } = await resolveKernelFromArgs(treeItem);
      if (!kernelName || !definition) { return; }

      const confirm = await vscode.window.showWarningMessage(
        `Force recreate "${kernelName}"? This will delete and rebuild the venv.`,
        'Recreate',
        'Cancel'
      );
      if (confirm !== 'Recreate') { return; }

      await runSingleKernelSetup(kernelName, definition, true, variant, treeDataProvider);
    })
  );

  // ----- Register All Kernels -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.registerAllKernels', async () => {
      const configResult = await loadKernelsConfig();
      if (!configResult.config) {
        vscode.window.showErrorMessage(`Cannot load config: ${configResult.error}`);
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Registering all kernels...',
          cancellable: true,
        },
        async (_progress, token) => {
          const results = await registerAllKernels(configResult.config!.kernels, token);
          await treeDataProvider.refresh();

          const succeeded = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success).length;
          if (failed > 0) {
            vscode.window.showWarningMessage(
              `Registration: ${succeeded} succeeded, ${failed} failed. Check Output for details.`
            );
          } else {
            vscode.window.showInformationMessage(`All ${succeeded} kernels registered successfully.`);
          }
        }
      );
    })
  );

  // ----- Register Kernel... (single, with picker) -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.registerKernel', async (treeItem?: KernelTreeItem) => {
      const { kernelName, definition, variant } = await resolveKernelFromArgs(treeItem);
      if (!kernelName || !definition) { return; }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Registering kernel: ${kernelName}...`,
          cancellable: false,
        },
        async () => {
          const result = await registerKernel(kernelName, definition, variant);
          await treeDataProvider.refresh();

          if (result.success) {
            vscode.window.showInformationMessage(`Kernel "${kernelName}" registered as ${result.specName}.`);
          } else {
            vscode.window.showErrorMessage(`Registration failed: ${result.message}`);
          }
        }
      );
    })
  );

  // ----- Unregister Kernel... -----
  context.subscriptions.push(
    vscode.commands.registerCommand('jupyterKernelManager.unregisterKernel', async (treeItem?: KernelTreeItem) => {
      const { kernelName, definition, variant } = await resolveKernelFromArgs(treeItem);
      if (!kernelName || !definition) { return; }

      const confirm = await vscode.window.showWarningMessage(
        `Unregister "${kernelName}"? It will no longer appear in the Jupyter kernel picker.`,
        'Unregister',
        'Cancel'
      );
      if (confirm !== 'Unregister') { return; }

      const result = await unregisterKernel(kernelName, variant);
      await treeDataProvider.refresh();

      if (result.success) {
        vscode.window.showInformationMessage(`Kernel "${kernelName}" unregistered.`);
      } else {
        vscode.window.showErrorMessage(`Unregister failed: ${result.message}`);
      }
    })
  );

  // ----- Placeholder commands for Phase 4+ -----
  const placeholderCommands = [
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

// ----- Helpers -----

/**
 * Resolves a kernel name + definition from either a tree view context click
 * or a quick-pick dialog.
 */
async function resolveKernelFromArgs(
  treeItem?: KernelTreeItem,
): Promise<{ kernelName: string | undefined; definition: KernelDefinition | undefined; variant: string | undefined }> {
  // If invoked from tree view context menu
  if (treeItem?.kernelInfo) {
    const info = treeItem.kernelInfo;
    let variant: string | undefined;

    // If kernel has variants, ask user to pick one
    if (info.definition.variants) {
      variant = await pickVariant(info.name, info.definition);
      if (variant === undefined) {
        return { kernelName: undefined, definition: undefined, variant: undefined };
      }
    }

    return { kernelName: info.name, definition: info.definition, variant };
  }

  // Otherwise, show a quick pick to choose a kernel
  const configResult = await loadKernelsConfig();
  if (!configResult.config) {
    vscode.window.showErrorMessage(`Cannot load config: ${configResult.error}`);
    return { kernelName: undefined, definition: undefined, variant: undefined };
  }

  const kernels = configResult.config.kernels;
  const names = Object.keys(kernels);
  if (names.length === 0) {
    vscode.window.showInformationMessage('No kernels defined in kernels.json.');
    return { kernelName: undefined, definition: undefined, variant: undefined };
  }

  const items = names.map(name => ({
    label: name,
    description: kernels[name].display_name,
    detail: kernels[name].description,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a kernel to set up',
  });
  if (!picked) {
    return { kernelName: undefined, definition: undefined, variant: undefined };
  }

  const definition = kernels[picked.label];
  let variant: string | undefined;

  if (definition.variants) {
    variant = await pickVariant(picked.label, definition);
    if (variant === undefined) {
      return { kernelName: undefined, definition: undefined, variant: undefined };
    }
  }

  return { kernelName: picked.label, definition, variant };
}

/**
 * Shows a quick pick for selecting a kernel variant (e.g., cpu/gpu).
 */
async function pickVariant(kernelName: string, definition: KernelDefinition): Promise<string | undefined> {
  if (!definition.variants) { return undefined; }

  const variantNames = Object.keys(definition.variants);
  const items = variantNames.map(v => ({
    label: v,
    description: definition.variants![v].display_name ?? '',
    detail: `Requirements: ${definition.variants![v].requirements_file}`,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select variant for "${kernelName}"`,
  });

  return picked?.label;
}

/**
 * Runs setup for a single kernel with progress notification.
 */
async function runSingleKernelSetup(
  kernelName: string,
  definition: KernelDefinition,
  force: boolean,
  variant: string | undefined,
  treeDataProvider: KernelTreeDataProvider,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Setting up kernel: ${kernelName}${variant ? ` (${variant})` : ''}...`,
      cancellable: true,
    },
    async (_progress, token) => {
      const result = await setupKernel(kernelName, definition, force, variant, token);

      if (result.success) {
        // Auto-register if setting is enabled
        const autoRegister = vscode.workspace.getConfiguration('jupyterKernelManager').get<boolean>('autoRegister', true);
        if (autoRegister) {
          const regResult = await registerKernel(kernelName, definition, variant);
          if (regResult.success) {
            vscode.window.showInformationMessage(
              `Kernel "${kernelName}" set up and registered as ${regResult.specName}.`
            );
          } else {
            vscode.window.showWarningMessage(
              `Kernel "${kernelName}" set up, but registration failed: ${regResult.message}`
            );
          }
        } else {
          vscode.window.showInformationMessage(`Kernel "${kernelName}" setup complete: ${result.message}`);
        }
      } else {
        vscode.window.showErrorMessage(`Kernel "${kernelName}" setup failed: ${result.message}`);
      }

      await treeDataProvider.refresh();
    }
  );
}
