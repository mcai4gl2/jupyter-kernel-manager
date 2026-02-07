import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { isWindows, getVenvPythonPath, getVenvPipPath, getJupyterDataDir, removeDirectorySafely } from '../../platform/platform';

suite('Platform Utilities', () => {
  test('isWindows returns a boolean', () => {
    const result = isWindows();
    assert.strictEqual(typeof result, 'boolean');
    // Verify it matches the actual platform
    assert.strictEqual(result, process.platform === 'win32');
  });

  test('getVenvPythonPath returns platform-appropriate path', () => {
    const venvDir = '/project/kernels/default/.venv';
    const result = getVenvPythonPath(venvDir);

    if (isWindows()) {
      assert.ok(result.endsWith(path.join('Scripts', 'python.exe')));
    } else {
      assert.ok(result.endsWith(path.join('bin', 'python')));
    }
    assert.ok(result.startsWith(venvDir));
  });

  test('getVenvPipPath returns platform-appropriate path', () => {
    const venvDir = '/project/kernels/default/.venv';
    const result = getVenvPipPath(venvDir);

    if (isWindows()) {
      assert.ok(result.endsWith(path.join('Scripts', 'pip.exe')));
    } else {
      assert.ok(result.endsWith(path.join('bin', 'pip')));
    }
    assert.ok(result.startsWith(venvDir));
  });

  test('getJupyterDataDir returns non-empty string', () => {
    const result = getJupyterDataDir();
    assert.ok(result.length > 0);
    assert.ok(path.isAbsolute(result));
  });

  test('getJupyterDataDir returns platform-specific path', () => {
    const result = getJupyterDataDir();
    if (process.platform === 'darwin') {
      assert.ok(result.includes('Library/Jupyter'));
    } else if (process.platform === 'win32') {
      assert.ok(result.includes('jupyter'));
    } else {
      assert.ok(result.includes('jupyter'));
    }
  });

  suite('removeDirectorySafely', () => {
    let tmpDir: string;

    setup(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jkm-test-'));
    });

    test('removes a directory tree', async () => {
      const dir = path.join(tmpDir, 'nested', 'dir');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'file.txt'), 'content');

      await removeDirectorySafely(path.join(tmpDir, 'nested'));

      // Verify it's gone
      try {
        await fs.access(path.join(tmpDir, 'nested'));
        assert.fail('Directory should have been removed');
      } catch {
        // Expected
      }
    });

    test('does not throw for non-existent directory', async () => {
      // Should not throw
      await removeDirectorySafely(path.join(tmpDir, 'nonexistent'));
    });

    teardown(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
