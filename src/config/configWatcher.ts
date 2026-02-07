import * as vscode from 'vscode';
import { getConfigPath } from './kernelConfig';

/**
 * Watches kernels.json for changes and emits events.
 * Triggers config reload and tree view refresh on file changes.
 */
export class ConfigWatcher implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private watcher: vscode.FileSystemWatcher | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.createWatcher();

    // Re-create watcher if the config path setting changes
    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('jupyterKernelManager.configPath')) {
        this.createWatcher();
      }
    });
    this.disposables.push(configListener);
  }

  private createWatcher(): void {
    // Dispose previous watcher if any
    this.watcher?.dispose();

    const configPath = getConfigPath();
    const pattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] ?? '',
      configPath
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidChange(() => this._onDidChange.fire());
    this.watcher.onDidCreate(() => this._onDidChange.fire());
    this.watcher.onDidDelete(() => this._onDidChange.fire());

    this.disposables.push(this.watcher);
  }

  dispose(): void {
    this._onDidChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
