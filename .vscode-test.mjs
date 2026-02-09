import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  version: 'stable',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
  },
  coverage: {
    include: ['out/**/*.js'],
    exclude: ['out/test/**'],
    reporter: ['text', 'lcov'],
    output: './coverage',
  },
});
