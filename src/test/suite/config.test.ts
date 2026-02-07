import * as assert from 'assert';
import { validateConfig } from '../../config/kernelConfig';

suite('Config Validation', () => {
  test('accepts valid minimal config', () => {
    const result = validateConfig({
      kernels: {
        default: { display_name: 'Python (Default)' },
      },
    });
    assert.strictEqual(result, null);
  });

  test('accepts valid full config', () => {
    const result = validateConfig({
      kernels: {
        ml: {
          display_name: 'Python (ML)',
          description: 'Machine learning kernel',
          requirements_file: 'requirements.txt',
          python_version: '3.10',
          env: { CUDA_VISIBLE_DEVICES: '0' },
          variants: {
            cpu: { requirements_file: 'requirements-cpu.txt' },
            gpu: {
              display_name: 'Python (ML - GPU)',
              requirements_file: 'requirements-gpu.txt',
            },
          },
        },
      },
    });
    assert.strictEqual(result, null);
  });

  test('accepts config with multiple kernels', () => {
    const result = validateConfig({
      kernels: {
        a: { display_name: 'Kernel A' },
        b: { display_name: 'Kernel B' },
        c: { display_name: 'Kernel C' },
      },
    });
    assert.strictEqual(result, null);
  });

  test('rejects non-object', () => {
    assert.notStrictEqual(validateConfig('string'), null);
    assert.notStrictEqual(validateConfig(null), null);
    assert.notStrictEqual(validateConfig(42), null);
  });

  test('rejects missing kernels key', () => {
    const result = validateConfig({ other: {} });
    assert.ok(result);
    assert.ok(result.includes('kernels'));
  });

  test('rejects kernels as non-object', () => {
    const result = validateConfig({ kernels: 'not-an-object' });
    assert.ok(result);
  });

  test('rejects kernel without display_name', () => {
    const result = validateConfig({
      kernels: { bad: { description: 'no display name' } },
    });
    assert.ok(result);
    assert.ok(result.includes('display_name'));
  });

  test('rejects kernel with empty display_name', () => {
    const result = validateConfig({
      kernels: { bad: { display_name: '' } },
    });
    assert.ok(result);
  });

  test('rejects kernel with non-string display_name', () => {
    const result = validateConfig({
      kernels: { bad: { display_name: 123 } },
    });
    assert.ok(result);
  });

  test('rejects non-string description', () => {
    const result = validateConfig({
      kernels: {
        bad: { display_name: 'Test', description: 123 },
      },
    });
    assert.ok(result);
    assert.ok(result.includes('description'));
  });

  test('rejects non-string requirements_file', () => {
    const result = validateConfig({
      kernels: {
        bad: { display_name: 'Test', requirements_file: true },
      },
    });
    assert.ok(result);
  });

  test('rejects non-string python_version', () => {
    const result = validateConfig({
      kernels: {
        bad: { display_name: 'Test', python_version: 3.10 },
      },
    });
    assert.ok(result);
  });

  test('rejects non-object env', () => {
    const result = validateConfig({
      kernels: {
        bad: { display_name: 'Test', env: 'not-object' },
      },
    });
    assert.ok(result);
    assert.ok(result.includes('env'));
  });

  test('rejects variant without requirements_file', () => {
    const result = validateConfig({
      kernels: {
        bad: {
          display_name: 'Test',
          variants: { cpu: { display_name: 'CPU' } },
        },
      },
    });
    assert.ok(result);
    assert.ok(result.includes('requirements_file'));
  });

  test('rejects variant with empty requirements_file', () => {
    const result = validateConfig({
      kernels: {
        bad: {
          display_name: 'Test',
          variants: { cpu: { requirements_file: '' } },
        },
      },
    });
    assert.ok(result);
  });

  test('rejects non-object variant', () => {
    const result = validateConfig({
      kernels: {
        bad: {
          display_name: 'Test',
          variants: { cpu: 'not-object' },
        },
      },
    });
    assert.ok(result);
  });

  test('rejects non-object variants', () => {
    const result = validateConfig({
      kernels: {
        bad: { display_name: 'Test', variants: 'not-object' },
      },
    });
    assert.ok(result);
  });
});
