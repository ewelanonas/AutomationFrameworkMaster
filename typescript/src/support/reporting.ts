/**
 * The Allure run metadata: the environment block and the category buckets.
 *
 * **[runner-is-driver]** Both values below are handed to `allure-playwright` as
 * reporter options (`environmentInfo` and `categories`) in
 * `playwright.config.ts`, so the reporter writes them from the main process,
 * exactly once per run, by construction. Python needs a `filelock` plus a marker
 * file plus a run-scoped temp directory to achieve the same thing, because its
 * session fixture runs once *per worker*, and the marker's directory then has to
 * be chosen carefully. The question does not arise here: there is no lock, no
 * marker and no path-keyed "has this already happened" test.
 *
 * There is deliberately no `artifactDirectory()` and no `safeTestName()`:
 * everything this module produces by hand is **attached** through
 * `testInfo.attach`, and Playwright names its own output directory, so a path
 * builder and a file-name sanitiser would have no caller. The other three modules
 * need both because they write every artifact to disk themselves.
 *
 * `attachFailureArtifacts` lands with the UI fixtures, not here, because it needs
 * the `Page` and the console-error list those fixtures own.
 */

import type { AppConfig } from './config';
import { processTag, runId } from './runContext';
import { seed } from './testValues';

/**
 * Declared here, mirroring the keys `reporting.py` writes into `categories.json`.
 *
 * This module's own type: there is no exported equivalent to import, and
 * `strictTypeChecked` plus the no-`any` rule means the reporter option needs
 * something concrete to be assigned to. If `allure-playwright`'s option type
 * demands a mutable array, the array is spread into a mutable copy at the single
 * call site (`categories: [...allureCategories]`) rather than loosening this type.
 */
export interface AllureCategory {
  readonly name: string;
  readonly matchedStatuses: readonly string[];
  readonly messageRegex?: string; // omitted for buckets matched by status alone
}

/**
 * The ten keys `reporting.py` writes, with the runtime key renamed.
 *
 * The return type is `Record<string, string>`, so the boolean and the three
 * numbers are converted with an explicit `String(...)` rather than interpolated:
 * `restrict-template-expressions`, enabled by `strictTypeChecked`, rejects both,
 * and the fix is the conversion, never a rule disable.
 *
 * `nodeVersion` is `process.versions.node`, **not** `process.version`. The two
 * differ by a prefix — `22.20.5` against `v22.20.5` — and Python writes
 * `pythonVersion` as `platform.python_version()`, which carries no prefix. The
 * unprefixed form is the parity choice, and it is also the value `.node-version`
 * holds, so a reader comparing the report against the pin compares identical
 * strings.
 *
 * This file on disk is the primary evidence that the resolved timeout and the data
 * seed are what the run actually used: a log line can be swallowed, a file cannot.
 */
export function allureEnvironment(config: AppConfig): Record<string, string> {
  return {
    envName: config.envName,
    uiBaseUrl: config.ui.baseUrl,
    apiBaseUrl: config.api.baseUrl,
    browser: config.execution.browser,
    headless: String(config.execution.headless),
    elementMs: String(config.timeouts.elementMs),
    runId: runId(),
    processTag: processTag(),
    dataSeed: String(seed()),
    nodeVersion: process.versions.node,
  };
}

/**
 * The same six buckets as Java's `allure-categories.json`, with the
 * TypeScript/Playwright error names substituted.
 */
export const allureCategories: readonly AllureCategory[] = [
  {
    name: 'Product defect',
    matchedStatuses: ['failed'],
    messageRegex: '.*expect.*|.*Expected.*|.*AssertionError.*',
  },
  {
    name: 'Test defect',
    matchedStatuses: ['broken'],
    messageRegex: '.*TimeoutError.*|.*locator.*|.*ZodError.*',
  },
  {
    name: 'Contract drift',
    matchedStatuses: ['failed'],
    messageRegex: '.*schema.*|.*additionalProperties.*|.*required property.*',
  },
  {
    name: 'Environment problem',
    matchedStatuses: ['broken', 'failed'],
    messageRegex: '.*ECONNREFUSED.*|.*ENOTFOUND.*|.*502.*|.*503.*',
  },
  {
    name: 'Missing configuration',
    matchedStatuses: ['broken'],
    messageRegex: '.*Configuration is incomplete.*|.*needs a credential that is not configured.*',
  },
  {
    name: 'Quarantined',
    matchedStatuses: ['skipped'],
  },
];
