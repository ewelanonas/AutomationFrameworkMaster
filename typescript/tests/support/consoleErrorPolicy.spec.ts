/**
 * The console allowlist, checked without a browser.
 *
 * One case, matching `python/tests/support/test_console_error_policy.py`: an
 * allowlisted message is filtered and an unknown one survives. Both halves belong
 * to one behaviour, so splitting them would buy a second test name and no coverage.
 */

import { expect, test } from '@support/fixtures';

import { significant } from '@support/consoleErrorPolicy';

const REAL_PAGE_ERROR = 'TypeError: cannot read properties of undefined';

test.describe('Console error policy', () => {
  test('filters an allowlisted message and keeps an unknown one', { tag: ['@smoke'] }, () => {
    const screened = significant([
      'Failed to load resource: the server responded with a status of 401',
      'ERR_BLOCKED_BY_CLIENT',
      '   ',
      REAL_PAGE_ERROR,
    ]);

    expect(
      screened,
      'the anonymous-load 401 and a client-side blocker are documented noise; a real page ' +
        'error is not',
    ).toEqual([REAL_PAGE_ERROR]);
  });
});
