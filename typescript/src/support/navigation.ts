/**
 * The single navigation policy every page object uses.
 *
 * Centralised for the same reason the timeout policy is: when navigation behaviour
 * needs to change, it should change in one place rather than in every page object.
 * **Nothing else in this module calls `page.goto`** — `rg "\.goto\(" typescript/`
 * must match exactly one line, and that is a verification step.
 *
 * `toPath` is a deliberate rename of the shipped `to` (`navigation.py`,
 * `Navigation.cs`): `navigation.to(page, '/')` reads as a preposition rather than
 * a verb at a free-function call site. Behaviour is identical.
 */

import type { Page } from '@playwright/test';

import { loadConfig } from './config';
import { playwrightTimeouts } from './timeouts';

/**
 * Navigates to a path relative to the configured UI base URL.
 *
 * The timeout comes from `playwrightTimeouts(...)`, not from `config.timeouts`
 * directly, so the one-policy invariant is literally true: every mechanism that
 * waits reads its number from the same mapping function, and a future change to
 * that mapping reaches this call site too. The explicit option is belt-and-braces
 * rather than the only thing applying the policy — `use.navigationTimeout` already
 * applies to `page.goto`, and both resolve to the same `navigationMs`.
 *
 * `domcontentloaded`, not `load`. Against this single-page application `load`
 * waits for every subresource and the client-side router frequently supersedes the
 * initial navigation before those finish, surfacing as `net::ERR_ABORTED` on a
 * page that rendered perfectly well. That is a race in the waiting strategy, not
 * an application defect, and retrying the navigation would have hidden it.
 * Waiting for the DOM is not a shortcut either: every interaction afterwards goes
 * through an auto-waiting locator, so the element-level waits do the real work.
 */
export async function toPath(page: Page, path: string): Promise<void> {
  await page.goto(path, {
    waitUntil: 'domcontentloaded',
    timeout: playwrightTimeouts(loadConfig()).navigationMs,
  });
}
