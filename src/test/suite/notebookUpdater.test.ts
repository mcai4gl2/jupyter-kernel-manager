import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { resolveKernelForNotebook, updateSingleNotebook } from '../../kernels/notebookUpdater';

suite('Notebook Updater - resolveKernelForNotebook', () => {
  const kernelNames = ['common', 'kaggle_course', 'pytorch_study', 'image_audio', 'random'];

  test('matches kernel name in path', () => {
    assert.strictEqual(
      resolveKernelForNotebook('ai/kaggle_course/lesson1.ipynb', kernelNames),
      'kaggle_course'
    );
  });

  test('matches kernel name in nested path', () => {
    assert.strictEqual(
      resolveKernelForNotebook('deep/path/to/pytorch_study/notebook.ipynb', kernelNames),
      'pytorch_study'
    );
  });

  test('matches longer kernel name first', () => {
    // pytorch_study (14 chars) should match before random (6 chars) even if both appear
    const names = ['random', 'pytorch_study'];
    assert.strictEqual(
      resolveKernelForNotebook('pytorch_study/random_experiment.ipynb', names),
      'pytorch_study'
    );
  });

  test('falls back to "common" when available', () => {
    assert.strictEqual(
      resolveKernelForNotebook('unrelated/dir/notebook.ipynb', kernelNames),
      'common'
    );
  });

  test('falls back to "default" when available and no "common"', () => {
    const names = ['default', 'ml', 'data'];
    assert.strictEqual(
      resolveKernelForNotebook('unrelated/notebook.ipynb', names),
      'default'
    );
  });

  test('falls back to first kernel when no default/common', () => {
    const names = ['alpha', 'beta'];
    assert.strictEqual(
      resolveKernelForNotebook('unrelated/notebook.ipynb', names),
      'alpha'
    );
  });

  test('returns undefined for empty kernel list', () => {
    assert.strictEqual(
      resolveKernelForNotebook('anything.ipynb', []),
      undefined
    );
  });

  test('case-insensitive matching', () => {
    assert.strictEqual(
      resolveKernelForNotebook('AI/Kaggle_Course/notebook.ipynb', kernelNames),
      'kaggle_course'
    );
  });

  test('handles Windows-style backslash paths', () => {
    assert.strictEqual(
      resolveKernelForNotebook('ai\\pytorch_study\\notebook.ipynb', kernelNames),
      'pytorch_study'
    );
  });

  test('matches image_audio for both image and audio dirs', () => {
    assert.strictEqual(
      resolveKernelForNotebook('image_audio/processing.ipynb', kernelNames),
      'image_audio'
    );
  });
});

suite('Notebook Updater - updateSingleNotebook', () => {
  let tmpDir: string;

  setup(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jkm-test-'));
  });

  teardown(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function writeNotebook(name: string, content: object): Promise<string> {
    const filePath = path.join(tmpDir, name);
    return fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8').then(() => filePath);
  }

  test('notebook with different kernel is updated in dry run', async () => {
    const nb = {
      metadata: {
        kernelspec: { name: 'old-kernel', display_name: 'Old', language: 'python' },
      },
      nbformat: 4,
      nbformat_minor: 5,
      cells: [],
    };
    const filePath = await writeNotebook('dry.ipynb', nb);

    const result = await updateSingleNotebook(filePath, 'py-learn-common', 'Common', true);
    assert.strictEqual(result.updated, true);
    assert.strictEqual(result.oldKernel, 'old-kernel');
    assert.strictEqual(result.newKernel, 'py-learn-common');
    assert.strictEqual(result.error, undefined);

    // File should NOT be modified in dry run
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    assert.strictEqual(content.metadata.kernelspec.name, 'old-kernel');
  });

  test('notebook with different kernel is updated with actual write', async () => {
    const nb = {
      metadata: {
        kernelspec: { name: 'old-kernel', display_name: 'Old', language: 'python' },
      },
      nbformat: 4,
      nbformat_minor: 5,
      cells: [],
    };
    const filePath = await writeNotebook('write.ipynb', nb);

    const result = await updateSingleNotebook(filePath, 'py-learn-common', 'Common', false);
    assert.strictEqual(result.updated, true);
    assert.strictEqual(result.oldKernel, 'old-kernel');
    assert.strictEqual(result.newKernel, 'py-learn-common');

    // Verify file content was actually written
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    assert.strictEqual(content.metadata.kernelspec.name, 'py-learn-common');
    assert.strictEqual(content.metadata.kernelspec.display_name, 'Common');
    assert.strictEqual(content.metadata.kernelspec.language, 'python');
  });

  test('notebook already using correct kernel is skipped', async () => {
    const nb = {
      metadata: {
        kernelspec: { name: 'py-learn-common', display_name: 'Common', language: 'python' },
      },
      nbformat: 4,
      nbformat_minor: 5,
      cells: [],
    };
    const filePath = await writeNotebook('skip.ipynb', nb);

    const result = await updateSingleNotebook(filePath, 'py-learn-common', 'Common', false);
    assert.strictEqual(result.updated, false);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.oldKernel, 'py-learn-common');
  });

  test('notebook with no metadata gets metadata created', async () => {
    const nb = {
      nbformat: 4,
      nbformat_minor: 5,
      cells: [],
    };
    const filePath = await writeNotebook('nometa.ipynb', nb);

    const result = await updateSingleNotebook(filePath, 'py-learn-common', 'Common', false);
    assert.strictEqual(result.updated, true);
    assert.strictEqual(result.oldKernel, '');

    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    assert.strictEqual(content.metadata.kernelspec.name, 'py-learn-common');
  });

  test('malformed JSON returns parse error', async () => {
    const filePath = path.join(tmpDir, 'bad.ipynb');
    await fs.writeFile(filePath, '{ not valid json !!!', 'utf-8');

    const result = await updateSingleNotebook(filePath, 'py-learn-common', 'Common', false);
    assert.strictEqual(result.updated, false);
    assert.ok(result.error);
    assert.ok(result.error!.includes('Parse error'));
  });

  test('missing file returns read error', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.ipynb');

    const result = await updateSingleNotebook(filePath, 'py-learn-common', 'Common', false);
    assert.strictEqual(result.updated, false);
    assert.ok(result.error);
    assert.ok(result.error!.includes('Read error'));
  });
});
