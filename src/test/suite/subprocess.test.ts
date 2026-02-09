import * as assert from 'assert';
import { run } from '../../platform/subprocess';

suite('Subprocess - run()', () => {
  test('captures stdout from a successful command', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'console.log("hello world")'],
    });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('hello world'));
  });

  test('captures stderr', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'console.error("oops")'],
    });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('oops'));
  });

  test('returns non-zero exit code on failure', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'process.exit(42)'],
    });
    assert.strictEqual(result.exitCode, 42);
  });

  test('rejects when command is not found', async () => {
    await assert.rejects(
      () => run({ command: 'nonexistent-command-xyz', args: [] }),
    );
  });

  test('supports cwd option', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'console.log(process.cwd())'],
      cwd: '/tmp',
    });
    assert.strictEqual(result.exitCode, 0);
    // /tmp may resolve to /private/tmp on macOS
    assert.ok(result.stdout.includes('tmp'));
  });

  test('supports env option', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'console.log(process.env.TEST_VAR_JKM)'],
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

    const result = await run({
      command: process.execPath,
      args: ['-e', 'console.log("streamed")'],
      outputChannel: fakeChannel,
    });

    assert.strictEqual(result.exitCode, 0);
    assert.ok(appended.some(s => s.includes('streamed')));
  });
});
