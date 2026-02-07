import * as vscode from 'vscode';
import { ConfigWatcher } from './config/configWatcher';
import { KernelTreeDataProvider } from './ui/treeView';
import { registerCommands } from './ui/commands';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Jupyter Kernel Manager');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Jupyter Kernel Manager extension activated.');

  // --- Tree View ---
  const treeDataProvider = new KernelTreeDataProvider();
  const treeView = vscode.window.createTreeView('jupyterKernelManager.kernelTree', {
    treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // --- Config Watcher ---
  const configWatcher = new ConfigWatcher();
  configWatcher.onDidChange(async () => {
    outputChannel.appendLine('kernels.json changed — refreshing...');
    await treeDataProvider.refresh();
  });
  context.subscriptions.push(configWatcher);

  // --- Commands ---
  registerCommands(context, treeDataProvider);

  // --- Initial Load ---
  treeDataProvider.refresh();
}

export function deactivate(): void {
  // Cleanup handled by disposables registered on context.subscriptions
}

/**
 * Returns the shared output channel (for use by other modules in later phases).
 */
export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}
