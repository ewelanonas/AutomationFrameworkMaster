/**
 * Authentication behaviour, including the boundary cases that matter most.
 *
 * Six of these eight tests register their own `disposableAccount`. That is not
 * ceremony: sending a wrong password increments a server-side failed-attempt
 * counter, and on a shared account that counter eventually trips a lockout. When it
 * did, the API answered `423 Locked` to every login and took two language modules
 * down at once. A shared account is shared mutable state; tests own their data, and
 * this is what that rule is protecting against.
 *
 * The other two — the unknown-account case and the no-token case — deliberately do
 * **not** take one. Neither needs an account to exist, matching
 * `test_rejects_login_when_account_is_unknown` and
 * `test_denies_protected_endpoint_when_no_token_is_supplied`, and taking a fixture
 * a test does not use would pay a registration call per run for nothing.
 *
 * The statuses asserted here were observed against the running service, not
 * assumed. One is worth reading twice: a login request with the `password` field
 * **missing entirely** returns **401**, not the 422 a validation failure would
 * normally produce. The tests assert what the API does, and the inconsistency is
 * recorded in `shared/contracts/README.md` to raise with the API owners.
 */

import { errorOf } from '@clients/apiResult';
import { errorText } from '@models/apiError';
import { bearerHeaderValue } from '@models/auth';
import { requireValue } from '@support/require';
import * as testValues from '@support/testValues';

import { expect, test } from './fixtures';

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** A deliberately invalid value, and never a credential to any real system. */
const WRONG_PASSWORD = 'definitely-not-the-password';

const MAXIMUM_LOCKOUT_ATTEMPTS = 10;
const LOCKED_STATUS = 423;

/** Named and passed by name, so the single `filter` below is one line doing one thing. */
function isUnauthorized(status: number): boolean {
  return status === 401;
}

/** Changes the final character so the JWT signature fails but the shape stays intact. */
function flipLastCharacter(token: string): string {
  const head = token.slice(0, -1);

  if (token.endsWith('A')) {
    return `${head}B`;
  }

  return `${head}A`;
}

test.describe('Authentication API', () => {
  test(
    'issues a token when the credentials are valid',
    { tag: ['@smoke', '@regression'] },
    async ({ authClient, disposableAccount }) => {
      const result = await authClient.loginWith(
        disposableAccount.email,
        disposableAccount.password,
      );

      expect(result.status, 'valid credentials must be accepted').toBe(200);

      const login = requireValue(result.body, 'the login response body');

      expect.soft(login.access_token.trim(), 'a token is issued').not.toBe('');
      expect.soft(login.access_token, 'the token is a three-part JWT').toMatch(JWT_SHAPE);
      expect.soft(login.token_type.toLowerCase(), 'the scheme is bearer').toBe('bearer');
      expect(
        requireValue(login.expires_in, 'the advertised token expiry'),
        'the token expires',
      ).toBeGreaterThan(0);
    },
  );

  test(
    'grants access to the own profile when the token is valid',
    { tag: ['@regression'] },
    async ({ authClient, disposableAccount }) => {
      const login = await authClient.loginWith(disposableAccount.email, disposableAccount.password);
      expect(login.status, 'the account this test created must be able to sign in').toBe(200);

      const body = requireValue(login.body, 'the login response body');

      const profile = await test.step('read the own profile with the bearer token', async () => {
        return authClient.currentUser(bearerHeaderValue(body));
      });

      expect(profile.status, 'a freshly issued token must be accepted').toBe(200);
    },
  );

  test(
    'rejects the login when the password is wrong',
    { tag: ['@smoke', '@regression'] },
    async ({ authClient, disposableAccount, noInternalDetailLeaked }) => {
      const result = await authClient.loginWith(disposableAccount.email, WRONG_PASSWORD);

      expect(result.status, 'wrong credentials are unauthorized').toBe(401);
      expect(result.body, 'no token is issued on a failed login').toBeUndefined();

      const message = errorText(errorOf(result));
      expect(message, 'the rejection carries an error body').toBeDefined();

      // The wording must not distinguish "wrong password" from "no such account", or
      // anyone can enumerate which email addresses hold accounts.
      const lowered = String(message).toLowerCase();
      expect.soft(lowered, 'the rejection is explained').not.toBe('');
      expect
        .soft(lowered, 'the wording must not confirm the account exists')
        .not.toContain('password is incorrect');
      expect
        .soft(lowered, 'the wording must not confirm the account is unknown')
        .not.toContain('user not found');
      expect
        .soft(lowered, 'the wording must not confirm the account is unknown')
        .not.toContain('no such user');

      noInternalDetailLeaked(result.rawBody);
    },
  );

  test(
    'rejects the login when the password field is missing',
    { tag: ['@regression'] },
    async ({ authClient, disposableAccount }) => {
      // No `password` key at all, not an explicit null. Those are different requests
      // and this API treats them differently.
      const result = await authClient.login({ email: disposableAccount.email });

      // Observed behaviour: 401, not 422. Asserted as-is; see the file header.
      expect(result.status, 'a request missing a required field must be refused').toBe(401);
      expect(result.body, 'no token is issued').toBeUndefined();

      const message = errorText(errorOf(result));
      expect(message, 'the refusal carries an error body').toBeDefined();
      expect(String(message).trim(), 'the refusal is explained').not.toBe('');
    },
  );

  test(
    'rejects the login when the account is unknown',
    { tag: ['@regression'] },
    async ({ authClient }) => {
      const result = await authClient.loginWith(testValues.uniqueEmail(), 'any-password');

      expect(result.status, 'an unknown account is unauthorized').toBe(401);
      expect(result.body, 'no token is issued for an account that does not exist').toBeUndefined();
    },
  );

  test(
    'locks the account when failed attempts are repeated',
    { tag: ['@regression', '@destructive'] },
    async ({ accountFlow, authClient, disposableAccount }) => {
      // Destructive by design, which is exactly why it owns the throwaway account it
      // burns. The lockout was discovered the hard way, by accidentally triggering it on
      // a shared account; behaviour a suite can break itself on is behaviour worth
      // asserting deliberately. The loop lives in AccountFlow so this body has no
      // branching at all.
      const outcome = await accountFlow.burnUntilLocked(
        disposableAccount,
        MAXIMUM_LOCKOUT_ATTEMPTS,
      );
      const unauthorized = outcome.statusesBeforeLock.filter(isUnauthorized);

      expect(
        outcome.lockedAtAttempt,
        'the account must lock after repeated failures, otherwise credentials can be brute forced',
      ).toBeGreaterThan(0);

      // Two independently derived numbers, not a tautology: counting the 401s and
      // comparing to the recorded length still fails if any status was anything else,
      // and unlike `new Array(lockedAtAttempt - 1).fill(401)` it has no RangeError edge
      // when the lockout trips on the first attempt.
      expect(
        unauthorized,
        'every attempt before the lockout must be rejected as unauthorized, never 200 and never 500',
      ).toHaveLength(outcome.statusesBeforeLock.length);

      const afterLock = await authClient.loginWith(
        disposableAccount.email,
        disposableAccount.password,
      );

      expect(
        afterLock.status,
        'once locked, even the correct password must be refused until an administrator intervenes',
      ).toBe(LOCKED_STATUS);
    },
  );

  test(
    'denies a protected endpoint when no token is supplied',
    { tag: ['@smoke', '@regression'] },
    async ({ authClient, noInternalDetailLeaked }) => {
      // The header is ABSENT, not empty. "No token supplied" means absent, and those
      // are two different requests.
      const result = await authClient.currentUser();

      expect(
        result.status,
        'anonymous access to a protected endpoint must be 401, never 200 and never 500',
      ).toBe(401);

      noInternalDetailLeaked(result.rawBody);
    },
  );

  test(
    'denies a protected endpoint when the token is tampered',
    { tag: ['@regression'] },
    async ({ authClient, disposableAccount }) => {
      const login = await authClient.loginWith(disposableAccount.email, disposableAccount.password);
      expect(login.status, 'the account this test created must be able to sign in').toBe(200);

      const body = requireValue(login.body, 'the login response body');
      const tampered = flipLastCharacter(body.access_token);

      const result = await authClient.currentUser(`Bearer ${tampered}`);

      expect(result.status, 'a token whose signature no longer verifies must be rejected').toBe(
        401,
      );
    },
  );
});
