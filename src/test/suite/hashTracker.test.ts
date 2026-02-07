import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { computeFileHash, readStoredHash, writeHash, checkFreshness } from '../../venv/hashTracker';

suite('Hash Tracker', () => {
  let tmpDir: string;

  setup(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jkm-test-'));
  });

  teardown(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('computeFileHash returns consistent MD5 hex', async () => {
    const filePath = path.join(tmpDir, 'requirements.txt');
    await fs.writeFile(filePath, 'numpy==1.24.0\npandas>=2.0\n', 'utf-8');

    const hash1 = await computeFileHash(filePath);
    const hash2 = await computeFileHash(filePath);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 32); // MD5 hex is 32 chars
    assert.ok(/^[0-9a-f]{32}$/.test(hash1));
  });

  test('computeFileHash changes when content changes', async () => {
    const filePath = path.join(tmpDir, 'requirements.txt');

    await fs.writeFile(filePath, 'numpy==1.24.0\n', 'utf-8');
    const hash1 = await computeFileHash(filePath);

    await fs.writeFile(filePath, 'numpy==1.25.0\n', 'utf-8');
    const hash2 = await computeFileHash(filePath);

    assert.notStrictEqual(hash1, hash2);
  });

  test('computeFileHash returns empty string for missing file', async () => {
    const hash = await computeFileHash(path.join(tmpDir, 'missing.txt'));
    assert.strictEqual(hash, '');
  });

  test('writeHash and readStoredHash round-trip', async () => {
    const venvDir = path.join(tmpDir, '.venv');
    await fs.mkdir(venvDir, { recursive: true });

    await writeHash(venvDir, 'abc123def456');
    const stored = await readStoredHash(venvDir);

    assert.strictEqual(stored, 'abc123def456');
  });

  test('readStoredHash returns empty string when no hash file', async () => {
    const venvDir = path.join(tmpDir, '.venv');
    await fs.mkdir(venvDir, { recursive: true });

    const stored = await readStoredHash(venvDir);
    assert.strictEqual(stored, '');
  });

  test('checkFreshness reports upToDate when hashes match', async () => {
    const venvDir = path.join(tmpDir, '.venv');
    await fs.mkdir(venvDir, { recursive: true });

    const reqPath = path.join(tmpDir, 'requirements.txt');
    await fs.writeFile(reqPath, 'numpy==1.24.0\n', 'utf-8');

    // Compute and store the hash
    const hash = await computeFileHash(reqPath);
    await writeHash(venvDir, hash);

    const result = await checkFreshness(venvDir, reqPath);
    assert.strictEqual(result.upToDate, true);
    assert.strictEqual(result.currentHash, result.storedHash);
  });

  test('checkFreshness reports not upToDate when hashes differ', async () => {
    const venvDir = path.join(tmpDir, '.venv');
    await fs.mkdir(venvDir, { recursive: true });

    const reqPath = path.join(tmpDir, 'requirements.txt');
    await fs.writeFile(reqPath, 'numpy==1.24.0\n', 'utf-8');

    // Store an old hash
    await writeHash(venvDir, 'oldhash');

    const result = await checkFreshness(venvDir, reqPath);
    assert.strictEqual(result.upToDate, false);
    assert.notStrictEqual(result.currentHash, result.storedHash);
  });

  test('checkFreshness reports not upToDate when no stored hash', async () => {
    const venvDir = path.join(tmpDir, '.venv');
    await fs.mkdir(venvDir, { recursive: true });

    const reqPath = path.join(tmpDir, 'requirements.txt');
    await fs.writeFile(reqPath, 'numpy==1.24.0\n', 'utf-8');

    const result = await checkFreshness(venvDir, reqPath);
    assert.strictEqual(result.upToDate, false);
  });
});
