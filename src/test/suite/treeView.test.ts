import * as assert from 'assert';
import {
  getStatusLabel,
  getStatusIcon,
  KernelTreeItem,
} from '../../ui/treeView';
import { KernelStatus, KernelInfo } from '../../config/kernelConfig';

suite('Tree View', () => {
  suite('getStatusLabel', () => {
    test('returns "Ready" for Ready status', () => {
      assert.strictEqual(getStatusLabel(KernelStatus.Ready), 'Ready');
    });

    test('returns "Needs Update" for NeedsUpdate status', () => {
      assert.strictEqual(getStatusLabel(KernelStatus.NeedsUpdate), 'Needs Update');
    });

    test('returns "Not Set Up" for NotSetUp status', () => {
      assert.strictEqual(getStatusLabel(KernelStatus.NotSetUp), 'Not Set Up');
    });

    test('returns "Error" for Error status', () => {
      assert.strictEqual(getStatusLabel(KernelStatus.Error), 'Error');
    });
  });

  suite('getStatusIcon', () => {
    test('returns "check" icon for Ready status', () => {
      const icon = getStatusIcon(KernelStatus.Ready);
      assert.strictEqual(icon.id, 'check');
    });

    test('returns "warning" icon for NeedsUpdate status', () => {
      const icon = getStatusIcon(KernelStatus.NeedsUpdate);
      assert.strictEqual(icon.id, 'warning');
    });

    test('returns "circle-outline" icon for NotSetUp status', () => {
      const icon = getStatusIcon(KernelStatus.NotSetUp);
      assert.strictEqual(icon.id, 'circle-outline');
    });

    test('returns "error" icon for Error status', () => {
      const icon = getStatusIcon(KernelStatus.Error);
      assert.strictEqual(icon.id, 'error');
    });
  });

  suite('KernelTreeItem', () => {
    function makeKernelInfo(overrides?: Partial<KernelInfo>): KernelInfo {
      return {
        name: 'test_kernel',
        definition: {
          display_name: 'Test Kernel',
          description: 'A test kernel',
        },
        status: KernelStatus.Ready,
        isRegistered: true,
        venvPath: '/tmp/test/.venv',
        ...overrides,
      };
    }

    test('has correct description with status and registration', () => {
      const item = new KernelTreeItem(makeKernelInfo());
      assert.strictEqual(item.description, 'Ready | Registered');
    });

    test('shows "Not Registered" when isRegistered is false', () => {
      const item = new KernelTreeItem(makeKernelInfo({ isRegistered: false }));
      assert.strictEqual(item.description, 'Ready | Not Registered');
    });

    test('has contextValue "kernel"', () => {
      const item = new KernelTreeItem(makeKernelInfo());
      assert.strictEqual(item.contextValue, 'kernel');
    });

    test('getDetailItems returns expected items', () => {
      const info = makeKernelInfo({
        definition: {
          display_name: 'My Kernel',
          description: 'desc',
          python_version: '3.10',
        },
      });
      const item = new KernelTreeItem(info);
      const details = item.getDetailItems();

      // Should include: Display Name, Description, Requirements, Python Version, Status, Registered, Venv
      assert.ok(details.length >= 5);

      const labels = details.map(d => d.label as string);
      assert.ok(labels.some(l => l.includes('Display Name')));
      assert.ok(labels.some(l => l.includes('Status')));
      assert.ok(labels.some(l => l.includes('Registered')));
    });

    test('getDetailItems includes variants when present', () => {
      const info = makeKernelInfo({
        definition: {
          display_name: 'ML',
          variants: {
            cpu: { requirements_file: 'req-cpu.txt' },
            gpu: { display_name: 'GPU', requirements_file: 'req-gpu.txt' },
          },
        },
      });
      const item = new KernelTreeItem(info);
      const details = item.getDetailItems();
      const labels = details.map(d => d.label as string);
      assert.ok(labels.some(l => l.includes('Variant: cpu')));
      assert.ok(labels.some(l => l.includes('Variant: gpu')));
    });
  });
});
