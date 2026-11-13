import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 80,
      },
      // vitest 4 removed `coverage.all` (default `true` in v1-v3, which swept the whole repo
      // into the report). Without an explicit `include`, v4's new default only counts files
      // actually loaded by a test, so an untested file like sessionScanner.ts would silently
      // vanish from the report instead of counting as 0% — hiding a real coverage gap instead
      // of failing the gate on it. `include` restores the old "all of src/, minus exclude"
      // scope explicitly (see vitest 4 migration guide).
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'out/**',
        'esbuild.js',
        'eslint.config.mjs',
        'scratch/**',
        'src/types.ts',
        'src/officeTypes.ts',
        'src/extension.ts',
        'src/sessionTreeDataProvider.ts',
        'src/treeItems.ts',
        'src/logger.ts',
        'src/officePanel.ts',
        'src/webview/main.ts',
        'src/webview/render/**',
        'src/webview/ui/**',
      ],
    },
  },
});
