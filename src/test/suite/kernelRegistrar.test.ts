import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { getKernelSpecName, getKernelSpecsDir, isKernelRegistered } from '../../kernels/kernelRegistrar';

suite('Kernel Registrar', () => {
  suite('getKernelSpecName', () => {
    test('returns prefix-name format', () => {
      const result = getKernelSpecName('common');
      // Default prefix is "py-learn"
      assert.strictEqual(result, 'py-learn-common');
    });

    test('includes variant when provided', () => {
      const result = getKernelSpecName('pytorch', 'gpu');
      assert.strictEqual(result, 'py-learn-pytorch-gpu');
    });

    test('handles names with underscores', () => {
      const result = getKernelSpecName('kaggle_course');
      assert.strictEqual(result, 'py-learn-kaggle_course');
    });

    test('handles variant without special chars', () => {
      const result = getKernelSpecName('ml', 'cpu');
      assert.strictEqual(result, 'py-learn-ml-cpu');
    });
  });

  suite('getKernelSpecsDir', () => {
    test('returns an absolute path', () => {
      const result = getKernelSpecsDir();
      assert.ok(path.isAbsolute(result));
    });

    test('path ends with "kernels"', () => {
      const result = getKernelSpecsDir();
      assert.strictEqual(path.basename(result), 'kernels');
    });

    test('parent is jupyter data dir', () => {
      const result = getKernelSpecsDir();
      assert.ok(result.toLowerCase().includes('jupyter'));
    });
  });

  suite('isKernelRegistered', () => {
    test('returns false for a non-existent kernel', async () => {
      const result = await isKernelRegistered('nonexistent_kernel_xyz');
      assert.strictEqual(result, false);
    });

    test('returns false for a non-existent variant', async () => {
      const result = await isKernelRegistered('common', 'nonexistent_variant');
      assert.strictEqual(result, false);
    });

    test('returns true when kernel.json exists', async () => {
      // Create a temporary kernelspec to test positive case
      const specsDir = getKernelSpecsDir();
      const testSpecDir = path.join(specsDir, 'py-learn-__test_kernel__');
      try {
        await fs.mkdir(testSpecDir, { recursive: true });
        await fs.writeFile(
          path.join(testSpecDir, 'kernel.json'),
          JSON.stringify({ argv: ['python'], display_name: 'Test', language: 'python' }),
          'utf-8'
        );

        const result = await isKernelRegistered('__test_kernel__');
        assert.strictEqual(result, true);
      } finally {
        // Clean up
        await fs.rm(testSpecDir, { recursive: true, force: true });
      }
    });
  });
});
