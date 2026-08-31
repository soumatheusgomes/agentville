import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import boundaries from 'eslint-plugin-boundaries';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

// The parsing core must stay `vscode`-free (see CLAUDE.md "Keep `vscode` out of the
// parsing core"). Source files are flat under `src/`, so the layers are classified as
// `boundaries/files` categories — `boundaries/elements` patterns match folders, not
// individual files.
const VSCODE_LAYER_MODULES = ['extension', 'sessionTreeDataProvider', 'treeItems', 'subagentTreeChildren'];
const VSCODE_LAYER_GLOB = `src/{${VSCODE_LAYER_MODULES.join(',')}}.ts`;
// Negated rather than a plain `src/*.ts` catch-all: categories match independently, so
// an inclusive pattern would tag the VS Code modules as `core` as well and the layer
// policy would then fire on their own legitimate imports. A new file dropped into
// `src/` therefore lands in `core`, which is the restrictive side.
const CORE_GLOB = `src/!(${VSCODE_LAYER_MODULES.join('|')}).ts`;

export default defineConfig(
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      'esbuild.js',
      'eslint.config.mjs',
      'vitest.config.ts',
      'coverage/**',
      'scratch/**',
      // Tooling outside the extension source (not in tsconfig) — the typed config
      // can't parse them and they follow their own conventions.
      '.claude/**',
      '.agents/**',
      'scripts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      sonarjs,
      prettier,
      'import-x': importX,
    },
    // Every import-graph rule here (`no-cycle`, `no-restricted-paths`, and the
    // `boundaries` policies below) is a no-op without a resolver that can turn an
    // extensionless `./treeItems` into `src/treeItems.ts` — they silently pass instead
    // of failing loudly, which is why each one is covered by a probe in
    // `src/test/lintRules.test.ts`. The two keys are not redundant: `import-x` v4 only
    // honours a resolver instance under `resolver-next`, while `boundaries` still reads
    // the legacy `import/resolver` object.
    settings: {
      ...importX.flatConfigs.typescript.settings,
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      // Auto formatting
      'prettier/prettier': 'error',

      // Size limits
      'max-lines': [
        'error',
        {
          max: 355,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-lines-per-function': [
        'error',
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-statements': ['error', 20],

      // Complexity
      complexity: ['error', 10], // Cyclomatic complexity
      'sonarjs/cognitive-complexity': ['error', 15], // Cognitive complexity
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 3],

      // Duplicated code
      'sonarjs/no-identical-functions': ['error', 3],
      'sonarjs/no-duplicate-string': ['error', { threshold: 4 }],
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-duplicated-branches': 'error',

      // Import hygiene / circular dependencies
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-duplicates': 'error',
      // Cross-import validation (production code must never reach into test code) lives in its
      // own `files`-scoped block below — see the note there. The layer rule (core must not import
      // the VS Code layer) is enforced separately by `boundaries` below.

      // Strict TypeScript / Clean Code
      // `max-params` is covered by the TS-aware variant below; the core `max-params`
      // rule is deliberately left off so a violation isn't reported twice.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/max-params': ['error', { max: 3 }],
      // Numbers interpolate unambiguously; the rest of the family (objects, nullables,
      // `any`) stays banned so nothing stringifies to "[object Object]" in a log line.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // Cross-import validation: production code must never reach into test code.
  //
  // Which files the rule guards is decided by ESLint's own `files` glob, not by the zone's
  // `target`. That split is deliberate and platform-driven: `import-x/no-restricted-paths`
  // resolves a globbed `target` to an absolute path and matches it with minimatch, which on
  // Windows compares a forward-slash pattern against a backslash filename and silently matches
  // nothing — the exact "misconfigured rules report nothing at all" failure mode that
  // `src/test/lintRules.test.ts` exists to catch. A `target` with no glob in it takes the
  // plugin's `containsPath` branch instead, which is path-aware and correct on both platforms.
  // So: `files` narrows the rule to top-level production modules, and the zone only has to
  // answer "is the import coming out of src/test?".
  {
    files: ['src/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src',
              from: './src/test',
              message: 'Production code must not import from src/test — move the shared helper into src/.',
            },
          ],
        },
      ],
    },
  },
  // Layer boundaries: the dependency arrow only ever points inward, at the core.
  // The two policies below are the two halves of CLAUDE.md's "keep `vscode` out of
  // the parsing core" — the first bans the local UI modules, the second bans the
  // `vscode` package itself (a policy over local elements can't see external
  // modules). `default: 'allow'`, not 'disallow': this single rule also arbitrates
  // every external import, so denying by default would reject `node:fs` and friends.
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*.ts'],
      'boundaries/files': [
        { category: 'test', pattern: 'src/test/*.ts' },
        { category: 'vscode-layer', pattern: VSCODE_LAYER_GLOB },
        { category: 'core', pattern: CORE_GLOB },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          // Off by default, which silently skips every external import — without it the
          // `vscode` policy below never runs, since `vscode` resolves as an external
          // module rather than a local file.
          checkAllOrigins: true,
          policies: [
            {
              from: { file: { categories: 'core' } },
              disallow: { to: { file: { categories: 'vscode-layer' } } },
              message: 'The parsing core must not import the VS Code layer — keep the dependency pointing inward.',
            },
            {
              from: { file: { categories: 'core' } },
              disallow: { to: { module: { origin: 'external', source: 'vscode' } } },
              message: 'The parsing core must stay `vscode`-free so it can be unit-tested without the VS Code API.',
            },
          ],
        },
      ],
    },
  },
  // VS Code's `TreeDataProvider` contract types its change event as
  // `Event<T | undefined | null | void>`; the `| void` is what makes `fire()`
  // callable with no argument, so this layer can't satisfy `no-invalid-void-type`.
  {
    files: [VSCODE_LAYER_GLOB],
    rules: {
      '@typescript-eslint/no-invalid-void-type': 'off',
    },
  },
  // A suite's `describe` callback spans the whole file, so the per-function limits would
  // fire on every one of them; `max-lines` still applies, since file size is the limit
  // that actually keeps a suite reviewable. The unsafe-`any` family is off because these
  // fixtures are deliberately malformed log shapes.
  {
    files: ['src/test/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'max-nested-callbacks': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  eslintConfigPrettier,
);
