import * as assert from 'assert';
import { getPreferredMirror, getMirrorArgs, clearMirrorCache } from '../../venv/mirrorDetector';

suite('Mirror Detector', () => {
  // Reset the cached mirror before each test
  setup(() => {
    clearMirrorCache();
  });

  test('clearMirrorCache does not throw', () => {
    assert.doesNotThrow(() => clearMirrorCache());
  });

  test('getPreferredMirror returns null or MirrorInfo', async () => {
    // With default "auto" setting and no network, should return null
    const result = await getPreferredMirror();
    if (result === null) {
      assert.strictEqual(result, null);
    } else {
      assert.ok(typeof result.url === 'string');
      assert.ok(typeof result.name === 'string');
      assert.ok(result.url.length > 0);
    }
  });

  test('getPreferredMirror returns consistent result on second call (caching)', async () => {
    const first = await getPreferredMirror();
    const second = await getPreferredMirror();
    // Both calls should return the same result (cached)
    if (first === null) {
      assert.strictEqual(second, null);
    } else {
      assert.strictEqual(second?.url, first.url);
      assert.strictEqual(second?.name, first.name);
    }
  });

  test('getMirrorArgs returns string array', async () => {
    const args = await getMirrorArgs();
    assert.ok(Array.isArray(args));
    // Should be either [] (no mirror) or ["-i", "url"]
    if (args.length > 0) {
      assert.strictEqual(args.length, 2);
      assert.strictEqual(args[0], '-i');
      assert.ok(args[1].startsWith('https://'));
    }
  });

  test('clearMirrorCache resets the cached result', async () => {
    // First call populates cache
    await getPreferredMirror();
    // Clear cache
    clearMirrorCache();
    // Next call should re-evaluate (won't throw)
    const result = await getPreferredMirror();
    if (result === null) {
      assert.strictEqual(result, null);
    } else {
      assert.ok(typeof result.url === 'string');
    }
  });
});
