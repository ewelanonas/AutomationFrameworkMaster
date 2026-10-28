/**
 * Fixtures scoped to the API suite.
 *
 * This file holds exactly one thing: the shared error-body assertion that three
 * API tests need — one catalogue 404 and two auth rejections, the same three call
 * sites the C# module has.
 *
 * **It lives in the test tree because it asserts.** `automation-principles.md` §6,
 * `structure.md`'s dependency direction, and `python/tests/api/conftest.py`'s own
 * docstring all say the same thing, the last one having already rejected exactly
 * the `support/` option this file could otherwise have taken.
 *
 * **A fixture, not a helper in one spec file**, because both API spec files need it
 * and cross-importing one spec from another is banned. C# does import one test
 * class from another for this helper, which is the reason the rule exists rather
 * than a licence to copy it.
 *
 * `no-restricted-imports` is satisfied as written: this file imports
 * `@support/fixtures`, not `@playwright/test`, and re-exports the extended pair.
 */

import { test as base, expect } from '@support/fixtures';

/**
 * The definition of the rule, not an implementation detail, which is why the list
 * is named here rather than left to the caller. The six markers match Python's list
 * entry for entry, including `/var/www`, which is the one that catches a leaked
 * Laravel path.
 */
const INTERNAL_DETAIL_MARKERS = [
  'stack trace',
  'stacktrace',
  'sqlstate',
  'exception in',
  '/var/www',
  'laravel',
] as const;

/** Asserts an error body exposes no stack trace, SQL state or framework internals. */
function assertNoInternalDetailLeaked(rawBody: string): void {
  const lowered = rawBody.toLowerCase();

  for (const marker of INTERNAL_DETAIL_MARKERS) {
    expect(
      lowered,
      `an error response must not expose internals, but it contained '${marker}'. ` +
        'An error body must not hand an attacker a map of the implementation.',
    ).not.toContain(marker);
  }
}

export const test = base.extend<{ noInternalDetailLeaked: (rawBody: string) => void }>({
  noInternalDetailLeaked: async ({}, use) => {
    await use(assertNoInternalDetailLeaked);
  },
});

export { expect };
