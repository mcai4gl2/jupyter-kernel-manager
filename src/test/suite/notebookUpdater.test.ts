import * as assert from 'assert';
import { resolveKernelForNotebook } from '../../kernels/notebookUpdater';

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
