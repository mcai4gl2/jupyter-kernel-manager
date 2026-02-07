import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';

export interface RunOptions {
  /** Command to execute. */
  command: string;
  /** Arguments to pass. */
  args: string[];
  /** Working directory. */
  cwd?: string;
  /** Extra environment variables (merged with process.env). */
  env?: Record<string, string>;
  /** VS Code OutputChannel to stream stdout/stderr to. */
  outputChannel?: vscode.OutputChannel;
  /** Cancellation token — kills the child process when cancelled. */
  token?: vscode.CancellationToken;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a command as a child process with output streaming and cancellation support.
 *
 * stdout/stderr are both captured as strings AND streamed to the OutputChannel
 * (if provided) in real time, so the user can watch pip installs etc.
 */
export function run(options: RunOptions): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const { command, args, cwd, env, outputChannel, token } = options;

    const child: ChildProcess = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      // On Windows, use shell so that `.exe` resolution works
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      outputChannel?.append(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      outputChannel?.append(text);
    });

    // Handle cancellation
    const cancelListener = token?.onCancellationRequested(() => {
      child.kill();
    });

    child.on('error', (err: Error) => {
      cancelListener?.dispose();
      reject(err);
    });

    child.on('close', (code: number | null) => {
      cancelListener?.dispose();
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
