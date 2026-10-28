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
 * `attachFailureArtifacts` is called from the `failureArtifacts` fixture on
 * `uiTest`, which owns the `Page` and the console-error list it needs.
 */

import type { Page, TestInfo } from '@playwright/test';

import type { AppConfig } from './config';
import * as redaction from './redaction';
import { processTag, runId } from './runContext';
import * as testLog from './testLog';
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

/**
 * The DOM snapshot and the diagnostics blob, each isolated from the other.
 *
 * Playwright already retains and attaches the trace, the screenshot and the video
 * on failure through `use.trace` / `screenshot` / `video`. What it does **not**
 * produce, and the other three modules do, is these two — so these two are all
 * this function adds.
 *
 * Each capture runs through {@link tryCapture}, so losing the DOM snapshot does
 * not cost the diagnostics.
 */
export async function attachFailureArtifacts(
  page: Page,
  consoleErrors: readonly string[],
  testInfo: TestInfo,
): Promise<void> {
  async function capturePageHtml(): Promise<void> {
    const html = redaction.body(await page.content());

    await testInfo.attach('Page HTML at failure', { body: html, contentType: 'text/html' });
  }

  async function captureDiagnostics(): Promise<void> {
    const report = await diagnosticsReport(page, consoleErrors, testInfo);

    await testInfo.attach('Failure diagnostics', { body: report, contentType: 'text/plain' });
  }

  await tryCapture('page HTML', capturePageHtml);
  await tryCapture('failure diagnostics', captureDiagnostics);
}

/**
 * The diagnostics blob: who failed, which run it belonged to, where the browser
 * was, and everything the console said.
 *
 * `worker` reads `testInfo.workerIndex` and `parallelIndex` rather than
 * `test.info()`: the same two numbers, from the object the caller already holds.
 * Python reports `PYTEST_XDIST_WORKER` here and C# has no equivalent at all.
 *
 * The whole blob goes through `redaction.text` on the way out, which is the only
 * reason it is safe to put a page's console output in a report that outlives the run.
 */
async function diagnosticsReport(
  page: Page,
  consoleErrors: readonly string[],
  testInfo: TestInfo,
): Promise<string> {
  const lines: string[] = [];

  // titlePath is the project, the file and the enclosing describe blocks as well as
  // the title, which is the closest analogue of NUnit's FullName.
  lines.push(`test: ${testInfo.titlePath.join(' > ')}`);
  lines.push(`runId: ${runId()}`);
  lines.push(`processTag: ${processTag()}`);
  lines.push(
    `worker: ${String(testInfo.workerIndex)} (parallel slot ${String(testInfo.parallelIndex)})`,
  );

  try {
    lines.push(`url: ${page.url()}`);
    lines.push(`title: ${await page.title()}`);
  } catch (error) {
    // Expected when the page has already closed. The rest of the report is still
    // worth having, which is why this is caught here rather than abandoning it all.
    lines.push(`url/title unavailable: ${messageOf(error)}`);
  }

  lines.push(`browser console errors: ${String(consoleErrors.length)}`);
  for (const consoleError of consoleErrors) {
    lines.push(`  - ${consoleError}`);
  }

  return redaction.text(lines.join('\n'));
}

/**
 * Runs an artifact capture, degrading a failure to a warning rather than replacing
 * the failure it was trying to explain.
 *
 * **This is the one broad catch in the module**, and it carries the justification
 * `UiTestBase.TryCaptureAsync` records: when the browser has already closed, an
 * attachment call throws from teardown and the runner then reports *that* alongside
 * the real assertion failure, so the diagnostic path becomes the headline.
 *
 * The callback is passed by name, never inlined, so a reader of
 * {@link attachFailureArtifacts} sees which captures run without reading how.
 */
async function tryCapture(what: string, capture: () => Promise<void>): Promise<void> {
  try {
    await capture();
  } catch (error) {
    testLog.warn(`Could not capture ${what}: ${describeError(error)}`);
  }
}

/** `<name>: <message>` for an `Error`, and whatever was thrown otherwise. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

/** The message alone, for the narrow url/title guard. */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
