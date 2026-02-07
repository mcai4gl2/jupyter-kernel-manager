import * as vscode from 'vscode';
import { ConfigWatcher } from './config/configWatcher';
import { KernelTreeDataProvider } from './ui/treeView';
import { registerCommands } from './ui/commands';
import { KernelTaskProvider } from './ui/taskProvider';
import { KernelStatusBar } from './ui/statusBar';

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

  // --- Task Provider ---
  const taskProvider = new KernelTaskProvider();
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider('jupyter-kernel-manager', taskProvider)
  );

  // --- Config Watcher ---
  const configWatcher = new ConfigWatcher();
  configWatcher.onDidChange(async () => {
    outputChannel.appendLine('kernels.json changed — refreshing...');
    taskProvider.invalidate();
    await treeDataProvider.refresh();
  });
  context.subscriptions.push(configWatcher);

  // --- Status Bar ---
  const statusBar = new KernelStatusBar();
  statusBar.register(context);

  // --- Commands ---
  registerCommands(context, treeDataProvider);

  // --- Initial Load ---
  treeDataProvider.refresh();

  // Refresh status bar after tree loads
  configWatcher.onDidChange(() => statusBar.update());
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
