/**
 * An account this test run created and therefore owns.
 *
 * Owning the account is the whole point. A test that needs to send a wrong
 * password — to check the rejection, or that the message does not reveal whether
 * the account exists — increments a server-side failed-attempt counter. On a
 * shared account that counter eventually trips a lockout and takes the entire
 * suite down with it, including every happy path. That is not hypothetical: when
 * it happened here, the API answered `423 Locked` to every login across two
 * language modules at once.
 *
 * With a per-test account, locking it costs nothing: nobody else will ever use it
 * again.
 *
 * Plain `z.object()` — see `product.ts`'s header.
 */

import { z } from 'zod';

import { MARKER } from '@support/redaction';

export const testAccountSchema = z.object({
  email: z.string(),
  password: z.string(),
});
export type TestAccount = z.infer<typeof testAccountSchema>;

/**
 * The account as a log-safe string, with the password replaced by the marker.
 *
 * Matches `TestAccount.cs`'s `ToString()` and `test_account.py`'s `__str__` word
 * for word, so the four modules' log lines still diff. See `auth.ts`'s header for
 * why this is a function rather than an override.
 */
export function describeAccount(account: TestAccount): string {
  return `TestAccount { email = ${account.email}, password = ${MARKER} }`;
}
