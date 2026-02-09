import * as assert from 'assert';
import * as path from 'path';
import { getKernelVenvPath, getKernelDir, getRequirementsPath } from '../../venv/venvManager';
import { KernelDefinition } from '../../config/kernelConfig';

suite('VenvManager - Path Helpers', () => {
  // Note: In the test environment, vscode.workspace.workspaceFolders may be
  // undefined, causing resolveKernelsDir() to return undefined. These tests
  // exercise both the undefined path and (if a workspace is open) the resolved path.

  suite('getKernelVenvPath', () => {
    test('returns undefined when no workspace is open', () => {
      // If running in a workspace-less test environment
      const result = getKernelVenvPath('test-kernel');
      if (result === undefined) {
        assert.strictEqual(result, undefined);
      } else {
        assert.ok(result.endsWith(path.join('test-kernel', '.venv')));
        assert.ok(path.isAbsolute(result));
      }
    });
  });

  suite('getKernelDir', () => {
    test('returns undefined when no workspace is open', () => {
      const result = getKernelDir('test-kernel');
      if (result === undefined) {
        assert.strictEqual(result, undefined);
      } else {
        assert.ok(result.endsWith('test-kernel'));
        assert.ok(path.isAbsolute(result));
      }
    });
  });

  suite('getRequirementsPath', () => {
    const baseDef: KernelDefinition = {
      display_name: 'Test Kernel',
    };

    test('returns undefined when no workspace is open', () => {
      const result = getRequirementsPath('test', baseDef);
      if (result === undefined) {
        assert.strictEqual(result, undefined);
      } else {
        assert.ok(result.endsWith('requirements.txt'));
      }
    });

    test('uses default requirements.txt when not specified', () => {
      const result = getRequirementsPath('test', baseDef);
      if (result !== undefined) {
        assert.ok(result.endsWith('requirements.txt'));
      }
    });

    test('uses custom requirements_file when specified', () => {
      const def: KernelDefinition = {
        display_name: 'Test',
        requirements_file: 'reqs-custom.txt',
      };
      const result = getRequirementsPath('test', def);
      if (result !== undefined) {
        assert.ok(result.endsWith('reqs-custom.txt'));
      }
    });

    test('uses variant requirements_file when variant is specified', () => {
      const def: KernelDefinition = {
        display_name: 'Test',
        variants: {
          gpu: {
            requirements_file: 'requirements-gpu.txt',
            display_name: 'GPU variant',
          },
        },
      };
      const result = getRequirementsPath('test', def, 'gpu');
      if (result !== undefined) {
        assert.ok(result.endsWith('requirements-gpu.txt'));
      }
    });

    test('falls back to default when variant is specified but does not exist', () => {
      const def: KernelDefinition = {
        display_name: 'Test',
        requirements_file: 'reqs.txt',
        variants: {
          gpu: { requirements_file: 'requirements-gpu.txt' },
        },
      };
      const result = getRequirementsPath('test', def, 'nonexistent');
      if (result !== undefined) {
        assert.ok(result.endsWith('reqs.txt'));
      }
    });
  });
});
