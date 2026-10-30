/**
 * The one selection that cannot be expressed against the main config.
 *
 * **The finding this file exists for, verified on Playwright 1.64.1:** a CLI
 * `--grep-invert` **combines with** the config-level `grepInvert` instead of
 * replacing it. The isolating measurement is
 * `playwright test --list --grep-invert 'zzz-nothing-matches'`, which reports **47**
 * rather than 48 — the config pattern `/@destructive|@quarantine/` still removed the
 * lockout case even though the command line supplied a pattern that matches nothing.
 * So a config-level `grepInvert` **cannot be narrowed from the command line at all**,
 * and `playwright test --grep @destructive --grep-invert @quarantine` selects
 * **nothing**. A second config file is the way to select a tag the main config
 * excludes.
 *
 * Everything else is inherited by spreading the default export, and that is the point
 * rather than a convenience: `testIdAttribute`, `workers`, the four reporters, the
 * timeout policy, `outputDir` and the four projects all stay defined in exactly one
 * place. The only difference is `grepInvert`, which drops `@destructive` and keeps
 * `@quarantine`. Two configs that restated each other would be two configs that drift.
 *
 * Importing the main config also re-runs its module scope, so `loadConfig()`,
 * `pinRunIdForWorkers()` and `pinSeedForWorkers()` happen here exactly as they do for
 * every other selection.
 *
 * **`@destructive` stays excluded by construction everywhere else.** A bare
 * `playwright test` reads the main config, so the obvious command remains the safe
 * one — which matters, because the test this config selects deliberately burns an
 * account, and a shared account answering `423 Locked` is the defect that took down
 * two modules at once.
 */

import { defineConfig } from '@playwright/test';

import base from './playwright.config';

export default defineConfig({
  ...base,
  grepInvert: /@quarantine/,
});
