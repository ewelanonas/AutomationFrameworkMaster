/**
 * The runner wiring.
 *
 * **[runner-is-driver]** In the other three modules most of what follows is code
 * in `support/`; here it is declarative configuration, which is better — it cannot
 * be forgotten by a test that takes a different base class. The thing to be
 * careful about is that **this file is evaluated by the main process and again by
 * every worker process**, and workers are forked with the parent's `process.env`
 * as it stands at fork time. That is why the two pins below are called here and
 * not only in `global.setup.ts`.
 */

import path from 'node:path';

import { defineConfig, type LaunchOptions } from '@playwright/test';

import { loadConfig, type AppConfig } from '@support/config';
import * as reporting from '@support/reporting';
import * as repoPaths from '@support/repoPaths';
import * as runContext from '@support/runContext';
import * as testValues from '@support/testValues';
import { playwrightTimeouts } from '@support/timeouts';

// This is where configuration fails fast: Playwright evaluates this file before it
// invokes globalSetup, so a missing base URL throws during config evaluation and
// the run never reaches `global.setup.ts`. The fail-fast guarantee therefore does
// not depend on globalSetup being configured at all.
const config = loadConfig();

runContext.pinRunIdForWorkers(); // before anything derives a path from the run id
runContext.pinInvocationTagForWorkers(); // and before outputDir is derived from it
testValues.pinSeedForWorkers(); // each module pins the variable it owns

const t = playwrightTimeouts(config);

// Absolute, and anchored to this module rather than to the cwd, so neither
// Playwright nor a third-party reporter can re-resolve an output path against
// whatever directory the suite happened to be launched from.
const reportsDir = repoPaths.reports();

/**
 * `--force-prefers-reduced-motion` for chromium only, matching Java's
 * `PlaywrightFactory` and Python's `launch_browser`. Firefox and WebKit reject the
 * flag, so it is not passed to them — a divergence from Python, which passes it to
 * all three and gets away with it only because it runs chromium.
 *
 * Config assembly, not framework surface, so it lives here and nothing imports it.
 */
function chromiumArgs(appConfig: AppConfig): { launchOptions?: LaunchOptions } {
  if (appConfig.execution.browser === 'chromium') {
    return { launchOptions: { args: ['--force-prefers-reduced-motion'] } };
  }

  return {};
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Zero in CI as well as locally. The Java, C# and Python suites do not retry at
  // all, and Playwright's junit reporter — the file the CI gate and
  // junit_summary.py read — records a retried-then-passed test with its final
  // status, so a retry would make this the one module of four whose flake goes
  // green on the required check. flaky-test-policy.md's "CI: maximum 1 retry" is a
  // cap, not an instruction, and typescript-testing.md's example line
  // (`process.env.CI ? 1 : 0`) loses to cross-module parity here. Design §17.1
  // row 27.
  retries: 0,
  // Not '50%'. The C# module measured this against the same public sandbox: at
  // four workers the suite drew ERR_CONNECTION_RESET, SSL handshake failures and
  // navigation timeouts — five failures caused entirely by its own load — and at
  // two workers it went 34/34 green with wall clock dropping from 35s to 12s.
  // ci-cd-pipelines.md's 50% of CPU is right for infrastructure you own and wrong
  // for a shared free sandbox. `--workers` overrides this for anyone who wants to
  // measure again.
  workers: 2,
  timeout: t.testMs, // workflowMs
  expect: { timeout: t.expectMs }, // elementMs
  // The always-excluded set, the same one Java pins in its POM.
  //
  // A CLI `--grep-invert` **combines with** this value rather than replacing it —
  // measured on Playwright 1.64.1, where `--list --grep-invert 'zzz-nothing-matches'`
  // reports 47 rather than 48. So this pattern cannot be narrowed from the command
  // line, and the scripts pass only `--grep`: adding `--grep-invert` would subtract
  // further, never less. Selecting `@destructive` therefore needs a config whose
  // `grepInvert` does not name it, which is `playwright.destructive.config.ts`.
  // Excluding both tags here rather than in the scripts is what keeps a bare
  // `playwright test` safe by construction.
  grepInvert: /@destructive|@quarantine/,
  globalSetup: './global.setup.ts',
  // A top-level option, not a `use` key, and it embeds the run id so Playwright's
  // own trace, video and screenshot land under the same `failure-artifacts/<runId>/`
  // root the other three modules use. Playwright owns the per-test subdirectory
  // name below it.
  //
  // The invocation tag below the run id is not decoration. Playwright **wipes
  // `outputDir` when a run starts**, and a run id is shared by design — every job
  // of a workflow run resolves the same `GITHUB_RUN_ID`, and `AF_RUN_ID` lets a
  // developer reuse one on purpose — so two invocations keyed on the run id alone
  // share one directory and each deletes the other's in-flight traces. Measured:
  // two concurrent `test:smoke` shells with `AF_RUN_ID` pinned failed 2 of 23 with
  // `ENOENT` from `apiRequestContext.dispose`, twice, while the same pair with
  // distinct run ids went green. Same reasoning as ADR 0006, one layer down: a
  // shared run id needs a per-invocation discriminator for paths, just as it needs
  // a per-process one for identities.
  outputDir: path.join(
    reportsDir,
    'failure-artifacts',
    runContext.runId(),
    runContext.invocationTag(),
  ),
  reporter: [
    ['list'],
    ['junit', { outputFile: path.join(reportsDir, 'junit.xml') }],
    // open: 'never' because the default is 'on-failure', which starts a local web
    // server and BLOCKS — forbidden for an agent-run command by tech.md's shell
    // notes, and it would otherwise hang the first failing local run.
    ['html', { outputFolder: path.join(reportsDir, 'playwright-report'), open: 'never' }],
    [
      'allure-playwright',
      {
        resultsDir: path.join(reportsDir, 'allure-results'),
        environmentInfo: reporting.allureEnvironment(config),
        categories: [...reporting.allureCategories],
      },
    ],
  ],
  use: {
    // The UI base URL, with no trailing slash. The API context builds its own.
    baseURL: config.ui.baseUrl,
    // From config: local.json sets data-test, the code default is data-testid, and
    // no page object mentions either.
    testIdAttribute: config.execution.testIdAttribute,
    actionTimeout: t.actionMs,
    navigationTimeout: t.navigationMs,
    headless: config.execution.headless,
    locale: config.ui.locale,
    timezoneId: config.ui.timezoneId,
    viewport: config.ui.viewport,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // No devices[...] descriptor: it would override the viewport, locale and
    // browserName this module resolves from config, making AF_BROWSER and the
    // configured viewport silently inert.
  },
  // Four projects with disjoint testDirs, so no test runs twice. Playwright
  // launches a browser only for a test that requests the `page` fixture, so the
  // first three never start one. Suite selection stays tag-based; projects are a
  // structural convenience (`--project ui`), never the gate's selector.
  //
  // There is deliberately no `setup` project and no storageState reuse: a single
  // authenticated storage state is one account shared by every test, and the
  // negative sign-in tests move server-side failed-attempt state against that
  // identity. A setup project also runs inside a worker, so it could not pin run
  // identity. Design §17.1 row 2.
  projects: [
    { name: 'support', testDir: './tests/support' },
    { name: 'api', testDir: './tests/api' },
    { name: 'contract', testDir: './tests/contract' },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: { browserName: config.execution.browser, ...chromiumArgs(config) },
    },
  ],
});
