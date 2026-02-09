import * as vscode from 'vscode';
import {
  KernelInfo,
  KernelStatus,
  KernelsConfig,
  getKernelInfoList,
  loadKernelsConfig,
} from '../config/kernelConfig';

// Use vscode.TreeItem as the generic type so all item types are compatible.
type TreeNode = vscode.TreeItem;

/**
 * Tree data provider for the Jupyter Kernels sidebar view.
 * Shows each kernel from kernels.json with status indicators.
 */
export class KernelTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null> = this._onDidChangeTreeData.event;

  private kernelInfos: KernelInfo[] = [];
  private configError: string | undefined;

  async refresh(): Promise<void> {
    const result = await loadKernelsConfig();
    if (result.config) {
      this.kernelInfos = await getKernelInfoList(result.config);
      this.configError = undefined;
    } else {
      this.kernelInfos = [];
      this.configError = result.error;
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    // If called on a kernel item, show kernel details
    if (element instanceof KernelTreeItem) {
      return element.getDetailItems();
    }

    // Leaf nodes have no children
    if (element) {
      return [];
    }

    // Root level: reload config if needed
    if (this.kernelInfos.length === 0 && !this.configError) {
      await this.refresh();
    }

    if (this.configError) {
      const item = new vscode.TreeItem(this.configError);
      item.contextValue = 'message';
      return [item];
    }

    if (this.kernelInfos.length === 0) {
      const item = new vscode.TreeItem('No kernels defined. Run "Initialize Kernel Config" to get started.');
      item.contextValue = 'message';
      return [item];
    }

    return this.kernelInfos.map(info => new KernelTreeItem(info));
  }

  async getConfig(): Promise<KernelsConfig | null> {
    const result = await loadKernelsConfig();
    return result.config;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

// ----- Status display helpers -----
// These are functions (not top-level constants) to avoid accessing KernelStatus
// at module load time, which fails due to a circular dependency chain:
// kernelRegistrar → extension → treeView → kernelConfig → kernelRegistrar

function getStatusIcon(status: KernelStatus): vscode.ThemeIcon {
  switch (status) {
    case KernelStatus.Ready: return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
    case KernelStatus.NeedsUpdate: return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    case KernelStatus.NotSetUp: return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
    case KernelStatus.Error: return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
  }
}

function getStatusLabel(status: KernelStatus): string {
  switch (status) {
    case KernelStatus.Ready: return 'Ready';
    case KernelStatus.NeedsUpdate: return 'Needs Update';
    case KernelStatus.NotSetUp: return 'Not Set Up';
    case KernelStatus.Error: return 'Error';
  }
}

// ----- Tree Items -----

export class KernelTreeItem extends vscode.TreeItem {
  constructor(public readonly kernelInfo: KernelInfo) {
    super(kernelInfo.name, vscode.TreeItemCollapsibleState.Collapsed);

    const regLabel = kernelInfo.isRegistered ? 'Registered' : 'Not Registered';
    this.description = `${getStatusLabel(kernelInfo.status)} | ${regLabel}`;
    this.iconPath = getStatusIcon(kernelInfo.status);
    this.tooltip = this.buildTooltip();
    this.contextValue = 'kernel';
  }

  private buildTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${this.kernelInfo.definition.display_name}**\n\n`);
    if (this.kernelInfo.definition.description) {
      md.appendMarkdown(`${this.kernelInfo.definition.description}\n\n`);
    }
    md.appendMarkdown(`Status: ${getStatusLabel(this.kernelInfo.status)}\n\n`);
    md.appendMarkdown(`Registered: ${this.kernelInfo.isRegistered ? 'Yes' : 'No'}\n\n`);
    if (this.kernelInfo.definition.variants) {
      const variantNames = Object.keys(this.kernelInfo.definition.variants).join(', ');
      md.appendMarkdown(`Variants: ${variantNames}\n`);
    }
    return md;
  }

  getDetailItems(): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    const def = this.kernelInfo.definition;

    items.push(makeDetailItem('Display Name', def.display_name));

    if (def.description) {
      items.push(makeDetailItem('Description', def.description));
    }

    const reqFile = def.requirements_file ?? 'requirements.txt';
    items.push(makeDetailItem('Requirements', reqFile));

    if (def.python_version) {
      items.push(makeDetailItem('Python Version', `>= ${def.python_version}`));
    }

    if (def.variants) {
      for (const [variantName, variant] of Object.entries(def.variants)) {
        const label = variant.display_name ?? variantName;
        items.push(makeDetailItem(`Variant: ${variantName}`, `${label} (${variant.requirements_file})`));
      }
    }

    items.push(makeDetailItem('Status', getStatusLabel(this.kernelInfo.status)));
    items.push(makeDetailItem('Registered', this.kernelInfo.isRegistered ? 'Yes' : 'No'));

    if (this.kernelInfo.venvPath) {
      items.push(makeDetailItem('Venv', this.kernelInfo.venvPath));
    }

    return items;
  }
}

function makeDetailItem(label: string, value: string): vscode.TreeItem {
  const item = new vscode.TreeItem(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
  item.contextValue = 'kernelDetail';
  return item;
}
