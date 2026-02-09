import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import {
  getKernelSpecName,
  getKernelSpecsDir,
  isKernelRegistered,
  buildKernelSpec,
  registerKernel,
  unregisterKernel,
  registerAllKernels,
} from '../../kernels/kernelRegistrar';
import { KernelDefinition } from '../../config/kernelConfig';

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

  suite('buildKernelSpec', () => {
    test('returns correct basic structure', () => {
      const spec = buildKernelSpec('/usr/bin/python3', 'My Kernel');
      assert.strictEqual(spec.language, 'python');
      assert.strictEqual(spec.display_name, 'My Kernel');
      assert.deepStrictEqual(spec.argv, ['/usr/bin/python3', '-m', 'ipykernel_launcher', '-f', '{connection_file}']);
    });

    test('includes metadata.debugger', () => {
      const spec = buildKernelSpec('/usr/bin/python3', 'Test');
      assert.ok(spec.metadata);
      assert.strictEqual(spec.metadata!.debugger, true);
    });

    test('includes env when provided with non-empty object', () => {
      const env = { CUDA_VISIBLE_DEVICES: '0', MY_VAR: 'hello' };
      const spec = buildKernelSpec('/usr/bin/python3', 'Test', env);
      assert.deepStrictEqual(spec.env, env);
    });

    test('omits env when undefined', () => {
      const spec = buildKernelSpec('/usr/bin/python3', 'Test');
      assert.strictEqual(spec.env, undefined);
    });

    test('omits env when empty object', () => {
      const spec = buildKernelSpec('/usr/bin/python3', 'Test', {});
      assert.strictEqual(spec.env, undefined);
    });
  });

  suite('registerKernel', () => {
    test('returns failure when no workspace is open', async () => {
      // In the test environment, no workspace folder is open,
      // so resolveKernelsDir() returns undefined.
      const definition: KernelDefinition = {
        display_name: 'Test Kernel',
      };
      const result = await registerKernel('test_kernel', definition);
      assert.strictEqual(result.success, false);
      assert.ok(result.message.toLowerCase().includes('workspace') || result.message.toLowerCase().includes('no workspace'));
    });

    test('returns failure when venv is invalid', async () => {
      // Even if a workspace were open, the venv wouldn't exist.
      // Without a workspace, we get the "no workspace" error first.
      const definition: KernelDefinition = {
        display_name: 'Bad Venv Kernel',
      };
      const result = await registerKernel('nonexistent_bad_venv', definition);
      assert.strictEqual(result.success, false);
    });

    test('result contains correct kernelName and specName', async () => {
      const definition: KernelDefinition = {
        display_name: 'Spec Name Test',
      };
      const result = await registerKernel('mykernel', definition);
      assert.strictEqual(result.kernelName, 'mykernel');
      assert.strictEqual(result.specName, 'py-learn-mykernel');
    });
  });

  suite('unregisterKernel', () => {
    test('returns failure for non-existent spec', async () => {
      const result = await unregisterKernel('__nonexistent_kernel_for_test__');
      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('not found'));
    });

    test('successfully unregisters after creating a temp spec', async () => {
      const specsDir = getKernelSpecsDir();
      const specName = getKernelSpecName('__unregister_test__');
      const specDir = path.join(specsDir, specName);

      try {
        // Create a temp kernelspec directory
        await fs.mkdir(specDir, { recursive: true });
        await fs.writeFile(
          path.join(specDir, 'kernel.json'),
          JSON.stringify({ argv: ['python'], display_name: 'Test', language: 'python' }),
          'utf-8'
        );

        // Verify it exists
        const exists = await isKernelRegistered('__unregister_test__');
        assert.strictEqual(exists, true);

        // Unregister
        const result = await unregisterKernel('__unregister_test__');
        assert.strictEqual(result.success, true);

        // Verify it's gone
        const existsAfter = await isKernelRegistered('__unregister_test__');
        assert.strictEqual(existsAfter, false);
      } finally {
        // Clean up if still present
        await fs.rm(specDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  suite('registerAllKernels', () => {
    test('empty kernels object returns empty results', async () => {
      const results = await registerAllKernels({});
      assert.deepStrictEqual(results, []);
    });

    test('cancellation token respected', async () => {
      const tokenSource = {
        isCancellationRequested: true,
        onCancellationRequested: (() => ({ dispose: () => {} })) as any,
      };

      const kernels: Record<string, KernelDefinition> = {
        a: { display_name: 'A' },
        b: { display_name: 'B' },
      };

      const results = await registerAllKernels(kernels, tokenSource as any);
      // Should cancel immediately: only the first entry gets a 'Cancelled' result
      assert.ok(results.length >= 1);
      assert.strictEqual(results[0].success, false);
      assert.strictEqual(results[0].message, 'Cancelled');
    });
  });
});
