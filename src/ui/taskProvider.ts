import * as vscode from 'vscode';
import { loadKernelsConfig } from '../config/kernelConfig';

const TASK_TYPE = 'jupyter-kernel-manager';

interface KernelTaskDefinition extends vscode.TaskDefinition {
  action: string;
  kernel?: string;
}

/**
 * Provides dynamic VS Code tasks generated from kernels.json.
 *
 * Tasks appear in the "Run Task" picker under the "jupyter-kernel-manager" type
 * and can be referenced from tasks.json or keybindings.
 */
export class KernelTaskProvider implements vscode.TaskProvider {
  private tasksPromise: Thenable<vscode.Task[]> | undefined;

  /**
   * Invalidate the cached task list (e.g., when kernels.json changes).
   */
  invalidate(): void {
    this.tasksPromise = undefined;
  }

  provideTasks(): Thenable<vscode.Task[]> {
    if (!this.tasksPromise) {
      this.tasksPromise = this.buildTasks();
    }
    return this.tasksPromise;
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as KernelTaskDefinition;
    if (definition.type === TASK_TYPE && definition.action) {
      return this.createShellTask(definition);
    }
    return undefined;
  }

  // ----- Internal -----

  private async buildTasks(): Promise<vscode.Task[]> {
    const tasks: vscode.Task[] = [];
    const configResult = await loadKernelsConfig();

    // Global tasks (not kernel-specific)
    tasks.push(this.createCommandTask(
      'Setup All Kernels',
      { type: TASK_TYPE, action: 'setupAll' },
      'jupyterKernelManager.setupAllKernels',
    ));

    tasks.push(this.createCommandTask(
      'Register All Kernels',
      { type: TASK_TYPE, action: 'registerAll' },
      'jupyterKernelManager.registerAllKernels',
    ));

    tasks.push(this.createCommandTask(
      'Check Kernel Health',
      { type: TASK_TYPE, action: 'checkHealth' },
      'jupyterKernelManager.checkHealth',
    ));

    tasks.push(this.createCommandTask(
      'Update Notebook Kernels',
      { type: TASK_TYPE, action: 'updateNotebooks' },
      'jupyterKernelManager.updateNotebookKernels',
    ));

    tasks.push(this.createCommandTask(
      'Update Notebook Kernels (Dry Run)',
      { type: TASK_TYPE, action: 'updateNotebooksDryRun' },
      'jupyterKernelManager.updateNotebookKernelsDryRun',
    ));

    // Per-kernel tasks
    if (configResult.config) {
      for (const name of Object.keys(configResult.config.kernels)) {
        tasks.push(this.createCommandTask(
          `Setup: ${name}`,
          { type: TASK_TYPE, action: 'setup', kernel: name },
          'jupyterKernelManager.setupKernel',
          `setup-${name}`,
        ));

        tasks.push(this.createCommandTask(
          `Register: ${name}`,
          { type: TASK_TYPE, action: 'register', kernel: name },
          'jupyterKernelManager.registerKernel',
          `register-${name}`,
        ));

        tasks.push(this.createCommandTask(
          `Shell: ${name}`,
          { type: TASK_TYPE, action: 'shell', kernel: name },
          'jupyterKernelManager.openKernelShell',
          `shell-${name}`,
        ));
      }
    }

    return tasks;
  }

  /**
   * Creates a task that invokes a VS Code command via the CLI.
   */
  private createCommandTask(
    label: string,
    definition: KernelTaskDefinition,
    commandId: string,
    source?: string,
  ): vscode.Task {
    const execution = new vscode.CustomExecution(async () => {
      return new CommandPseudoterminal(commandId);
    });

    const task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      label,
      source ?? TASK_TYPE,
      execution,
    );
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Silent };
    return task;
  }

  /**
   * Fallback for resolveTask — creates a shell task from a definition.
   */
  private createShellTask(definition: KernelTaskDefinition): vscode.Task | undefined {
    // Map action to command
    const actionToCommand: Record<string, string> = {
      setupAll: 'jupyterKernelManager.setupAllKernels',
      registerAll: 'jupyterKernelManager.registerAllKernels',
      checkHealth: 'jupyterKernelManager.checkHealth',
      updateNotebooks: 'jupyterKernelManager.updateNotebookKernels',
      updateNotebooksDryRun: 'jupyterKernelManager.updateNotebookKernelsDryRun',
      setup: 'jupyterKernelManager.setupKernel',
      register: 'jupyterKernelManager.registerKernel',
      shell: 'jupyterKernelManager.openKernelShell',
    };

    const commandId = actionToCommand[definition.action];
    if (!commandId) { return undefined; }

    const label = definition.kernel
      ? `${definition.action}: ${definition.kernel}`
      : definition.action;

    return this.createCommandTask(label, definition, commandId);
  }
}

/**
 * A pseudoterminal that executes a VS Code command and immediately closes.
 * Used by CustomExecution tasks to bridge VS Code tasks → extension commands.
 */
class CommandPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  constructor(private commandId: string) {}

  async open(): Promise<void> {
    this.writeEmitter.fire(`Running: ${this.commandId}\r\n`);
    try {
      await vscode.commands.executeCommand(this.commandId);
      this.writeEmitter.fire('Done.\r\n');
      this.closeEmitter.fire(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.writeEmitter.fire(`Error: ${msg}\r\n`);
      this.closeEmitter.fire(1);
    }
  }

  close(): void {
    // nothing to clean up
  }
}
