/**
 * The one timeout policy, mapped onto the runner's four waiting mechanisms.
 *
 * **[runner-is-driver]** Python needs `waits.py` because Playwright's `expect()`
 * keeps a timeout that `set_default_timeout` does not reach, and C# needs
 * `Assertions.SetDefaultExpectTimeout` in one-time setup for the same reason. In
 * Playwright Test all four are config keys, so the policy is applied
 * declaratively and cannot be forgotten by a test that takes a different base
 * class.
 *
 * | Policy key                      | Playwright setting      | Why this mapping                              |
 * | ------------------------------- | ----------------------- | --------------------------------------------- |
 * | `timeouts.workflowMs` (60000)   | `timeout`               | the per-test budget, a whole business action   |
 * | `timeouts.elementMs` (10000)    | `expect.timeout`        | the budget for one web-first assertion         |
 * | `timeouts.elementMs` (10000)    | `use.actionTimeout`     | the budget for one locator action              |
 * | `timeouts.navigationMs` (30000) | `use.navigationTimeout` | a page load reaching its ready state           |
 * | `timeouts.apiMs` (30000)        | `APIRequestContext`     | one HTTP request                               |
 *
 * This object is what makes the one-policy claim literally true rather than
 * nearly true: `playwright.config.ts` and the `apiHttp` fixture both read their
 * numbers from here, so a renamed property is a compile error in both. No
 * millisecond literal and no arithmetic appears in either caller.
 *
 * `globalTimeout` is deliberately unset: a run-level cap would turn a slow suite
 * into one unexplained failure instead of n explained ones.
 *
 * There is **no polling helper and no sleep in this module.** Nothing in the
 * inventory needs a polled predicate, and "abstraction added for later" is on the
 * anti-pattern list. When one is genuinely needed it belongs here, built on
 * `expect.poll`, with a timeout from this policy and a message naming what was
 * expected.
 */

import type { AppConfig } from './config';

export interface PlaywrightTimeouts {
  readonly testMs: number; // timeouts.workflowMs   -> defineConfig.timeout
  readonly expectMs: number; // timeouts.elementMs    -> expect.timeout
  readonly actionMs: number; // timeouts.elementMs    -> use.actionTimeout
  readonly navigationMs: number; // timeouts.navigationMs -> use.navigationTimeout
  readonly apiMs: number; // timeouts.apiMs        -> APIRequestContext timeout
}

export function playwrightTimeouts(config: AppConfig): PlaywrightTimeouts {
  return {
    testMs: config.timeouts.workflowMs,
    expectMs: config.timeouts.elementMs,
    actionMs: config.timeouts.elementMs,
    navigationMs: config.timeouts.navigationMs,
    apiMs: config.timeouts.apiMs,
  };
}
