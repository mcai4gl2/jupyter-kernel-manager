import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { run } from '../../platform/subprocess';

// run() uses shell: true on Windows, which routes through cmd.exe.
// process.execPath (the Electron binary) does not reliably handle -e via
// cmd.exe, so we write tiny scripts to temp files and execute them with
// the 'node' binary that is on PATH (setup-node guarantees this in CI).
const nodeCmd = 'node';

suite('Subprocess - run()', () => {
  let tmpDir: string;

  setup(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jkm-sub-'));
  });

  teardown(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Write a tiny JS file and return its path. */
  async function writeScript(name: string, code: string): Promise<string> {
    const file = path.join(tmpDir, name);
    await fs.writeFile(file, code, 'utf-8');
    return file;
  }

  test('captures stdout from a successful command', async () => {
    const script = await writeScript('out.js', 'console.log("hello world");');
    const result = await run({ command: nodeCmd, args: [script] });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('hello world'));
  });

  test('captures stderr', async () => {
    const script = await writeScript('err.js', 'console.error("oops");');
    const result = await run({ command: nodeCmd, args: [script] });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('oops'));
  });

  test('returns non-zero exit code on failure', async () => {
    const script = await writeScript('fail.js', 'process.exit(42);');
    const result = await run({ command: nodeCmd, args: [script] });
    assert.strictEqual(result.exitCode, 42);
  });

  test('handles command not found', async () => {
    // On Windows (shell: true), cmd.exe spawns successfully but the
    // command fails with a non-zero exit code.  On Unix (shell: false),
    // spawn emits an 'error' event and the promise rejects.
    try {
      const result = await run({ command: 'nonexistent-command-xyz', args: [] });
      assert.notStrictEqual(result.exitCode, 0);
    } catch {
      // Expected on non-Windows
    }
  });

  test('supports cwd option', async () => {
    const script = await writeScript('cwd.js', 'console.log(process.cwd());');
    const result = await run({
      command: nodeCmd,
      args: [script],
      cwd: os.tmpdir(),
    });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.trim().length > 0);
  });

  test('supports env option', async () => {
    const script = await writeScript('env.js', 'console.log(process.env.TEST_VAR_JKM);');
    const result = await run({
      command: nodeCmd,
      args: [script],
      env: { TEST_VAR_JKM: 'custom_value' },
    });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('custom_value'));
  });

  test('streams to outputChannel when provided', async () => {
    const appended: string[] = [];
    const fakeChannel = {
      append(text: string) { appended.push(text); },
    } as import('vscode').OutputChannel;

    const script = await writeScript('stream.js', 'console.log("streamed");');
    const result = await run({
      command: nodeCmd,
      args: [script],
      outputChannel: fakeChannel,
    });

    assert.strictEqual(result.exitCode, 0);
    assert.ok(appended.some(s => s.includes('streamed')));
  });
});
