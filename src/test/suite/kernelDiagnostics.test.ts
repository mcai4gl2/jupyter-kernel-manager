import * as assert from 'assert';
import { runDiagnostics } from '../../kernels/kernelDiagnostics';

suite('Kernel Diagnostics', () => {
  test('runDiagnostics completes without throwing', async () => {
    // Smoke test: in the test environment there is no config, no kernels,
    // and likely no Python configured. This exercises all the error-handling
    // branches in checkPythonEnvironment, checkJupyterDataDir, checkKernelSetup,
    // checkRegisteredKernelSpecs, and printRecommendations.
    await assert.doesNotReject(async () => {
      await runDiagnostics();
    });
  });
});
