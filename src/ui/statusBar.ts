import * as vscode from 'vscode';
import { loadKernelsConfig, getKernelInfoList, KernelStatus } from '../config/kernelConfig';
import { getKernelSpecName } from '../kernels/kernelRegistrar';

/**
 * Manages a status bar item that shows the active kernel's status
 * and allows quick switching via click.
 */
export class KernelStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      50,
    );
    this.item.command = 'jupyterKernelManager.statusBarClick';
    this.item.name = 'Jupyter Kernel Manager';

    // Listen for active editor changes to update the status bar
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
    );
    // Also listen for notebook editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveNotebookEditor(() => this.update()),
    );
  }

  /**
   * Register the click command and perform an initial update.
   */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.item);

    context.subscriptions.push(
      vscode.commands.registerCommand('jupyterKernelManager.statusBarClick', async () => {
        await this.handleClick();
      })
    );

    this.update();
  }

  /**
   * Refreshes the status bar display.
   */
  async update(): Promise<void> {
    // Only show when a notebook is active
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
      this.item.hide();
      return;
    }

    const configResult = await loadKernelsConfig();
    if (!configResult.config) {
      this.item.hide();
      return;
    }

    // Get the notebook's current kernel name from metadata
    const notebookKernel = this.getNotebookKernelName(notebookEditor);

    // Try to match against our managed kernels
    const kernelInfos = await getKernelInfoList(configResult.config);
    const matched = kernelInfos.find(k => getKernelSpecName(k.name) === notebookKernel);

    if (matched) {
      const statusIcon = this.getStatusIcon(matched.status);
      this.item.text = `${statusIcon} ${matched.name}`;
      this.item.tooltip = `Kernel: ${matched.definition.display_name}\nStatus: ${matched.status}${matched.isRegistered ? ' | Registered' : ''}`;
    } else if (notebookKernel) {
      this.item.text = `$(notebook) ${notebookKernel}`;
      this.item.tooltip = `Kernel: ${notebookKernel} (not managed by this extension)`;
    } else {
      this.item.text = '$(notebook) No kernel';
      this.item.tooltip = 'No kernel selected for this notebook';
    }

    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ----- Private -----

  private getNotebookKernelName(editor: vscode.NotebookEditor): string | undefined {
    const metadata = editor.notebook.metadata;
    if (metadata?.kernelspec?.name) {
      return metadata.kernelspec.name as string;
    }
    // Some notebooks store it differently
    if (metadata?.['custom']?.metadata?.kernelspec?.name) {
      return metadata['custom'].metadata.kernelspec.name as string;
    }
    return undefined;
  }

  private getStatusIcon(status: KernelStatus): string {
    switch (status) {
      case KernelStatus.Ready: return '$(check)';
      case KernelStatus.NeedsUpdate: return '$(warning)';
      case KernelStatus.NotSetUp: return '$(circle-slash)';
      case KernelStatus.Error: return '$(error)';
    }
  }

  private async handleClick(): Promise<void> {
    const configResult = await loadKernelsConfig();
    if (!configResult.config) {
      vscode.window.showErrorMessage('Cannot load kernel config.');
      return;
    }

    const kernelInfos = await getKernelInfoList(configResult.config);
    if (kernelInfos.length === 0) {
      vscode.window.showInformationMessage('No kernels defined.');
      return;
    }

    const items = kernelInfos.map(k => ({
      label: k.name,
      description: `${k.definition.display_name}  —  ${k.status}${k.isRegistered ? ' | Registered' : ''}`,
      detail: k.definition.description,
      kernelName: k.name,
    }));

    // Add a quick action header
    items.unshift({
      label: '$(gear) Manage Kernels...',
      description: 'Open kernel management commands',
      detail: undefined,
      kernelName: '__manage__',
    } as typeof items[0]);

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a kernel or action',
    });

    if (!picked) { return; }

    if (picked.kernelName === '__manage__') {
      // Show the extension commands
      await vscode.commands.executeCommand('workbench.action.quickOpen', '>Jupyter Kernel Manager');
    } else {
      // Switch the notebook to the selected kernel
      const notebookEditor = vscode.window.activeNotebookEditor;
      if (notebookEditor) {
        const specName = getKernelSpecName(picked.kernelName);
        // Use VS Code's built-in kernel selection
        await vscode.commands.executeCommand('notebook.selectKernel', {
          id: specName,
          extension: 'ms-toolsai.jupyter',
        });
      }
    }
  }
}
