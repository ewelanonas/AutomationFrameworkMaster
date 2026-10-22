import js from '@eslint/js';
import ts from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default ts.config(
  // Directory globs, not bare names. Whether a bare directory name in flat-config
  // `ignores` covers that directory's contents is a property of the ESLint version
  // rather than of this file, and guessing wrong is not cosmetic: js.configs.recommended
  // plus the `**/*.js` object below would then lint the generated JavaScript under
  // reports/playwright-report/, so `pnpm lint` fails with hundreds of errors in files
  // nobody wrote. `.prettierignore` already uses this form for the same directories.
  { ignores: ['**/node_modules/**', 'reports/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // This repo's rule re-statements and tightenings. The `files` key is written
  // out rather than inherited: without it, whether src/**/*.ts is linted at all
  // depends on what ts.configs.strictTypeChecked's bundled eslint-recommended
  // entry contributes as a files pattern — a property of a package version, not
  // of this file. Most un-awaited I/O in this module lives in clients, flows
  // and apiHttp, so "src is not linted" and "src is clean" must not look alike.
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'playwright.config.ts', 'global.setup.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message: 'Fixed sleeps are banned. Wait on a condition.',
        },
        {
          selector: "MemberExpression[property.name='reduce']",
          message: 'No reduce in this repo. Write the loop.',
        },
        {
          selector: "CallExpression[callee.property.name='count']",
          message: 'Read a collection with allInnerTexts(); count-then-nth is a race.',
        },
      ],
    },
  },

  // The Playwright preset, kept whole. It must be its own config object: the
  // preset is { plugins, rules }, so a literal `rules` key written beside the
  // spread replaces its rules instead of merging with them. The spread comes
  // FIRST and `files` LAST, so this module's scope wins whatever the preset
  // declares for itself.
  { ...playwright.configs['flat/recommended'], files: ['tests/**/*.ts'] },

  // This repo's additions and tightenings, in a second object so nothing shadows
  // anything.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'playwright/missing-playwright-await': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      'playwright/no-focused-test': 'error',
      'playwright/expect-expect': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-networkidle': 'error',
    },
  },

  // The import restriction, in its own object so its `files` list can exclude
  // the framework-internal specs for as long as there is nothing else for them
  // to import. `src/support/fixtures.ts` lands with the clients and flows
  // (design §19 step 11); until then `tests/support/*.spec.ts` imports `test`
  // and `expect` from @playwright/test directly, because the alternative is a
  // stub fixtures module that the real one would have to replace.
  // TEMPORARY: delete this `ignores` entry in the same change that switches
  // those specs to @support/fixtures.
  {
    files: ['tests/**/*.ts'],
    ignores: ['tests/support/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              message: 'Import test and expect from src/support/fixtures.ts.',
            },
          ],
        },
      ],
    },
  },

  // Two rules, one file shape. `async ({}, use)` is Playwright's documented shape
  // for a fixture that depends on no other fixture, and js.configs.recommended
  // flags the empty pattern. tests/api/fixtures.ts also holds the module's one
  // shared assertion helper (§6), which is a module-level function rather than a
  // test body, so the Playwright preset's no-standalone-expect may report it.
  // Scoped to this file shape — never a global disable, never a per-line one.
  {
    files: ['tests/**/fixtures.ts'],
    rules: { 'no-empty-pattern': 'off', 'playwright/no-standalone-expect': 'off' },
  },

  { files: ['**/*.js'], extends: [ts.configs.disableTypeChecked] },
);
