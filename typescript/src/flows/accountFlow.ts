/**
 * Creates disposable accounts over the API so no test depends on a shared one.
 *
 * This flow exists because of a failure this suite actually caused. The negative
 * sign-in tests send a wrong password on purpose. Against a shared demo account
 * that incremented a server-side failed-attempt counter until the account locked,
 * and the API began answering `423 Locked` to *every* login — including the happy
 * paths, in two language modules at once.
 *
 * The lockout was not a bug in the application. It was a test-design defect: a
 * shared account is shared mutable state, and the house rules say tests own the
 * data they need. A per-test account can be locked, abused, or left in any state
 * at all, because nothing else will ever use it.
 *
 * **Accounts are not deleted afterwards.** The demo API offers no self-delete, and
 * every generated address is on `example.invalid` with the run id and process tag
 * embedded, so the `af-` janitor contract can find them. In a real project this
 * flow would register cleanup at creation time. This matches all three shipped
 * modules; it is a property of the target, not a shortcut.
 *
 * This class takes **two** clients where the shipped flows take one, because
 * {@link AccountFlow.burnUntilLocked} is a second multi-step action against the
 * same subject and the flow layer is where multi-step actions live. Additive, and
 * recorded in design §17.1 row 23.
 */

import type { AuthClient } from '@clients/authClient';
import { isSuccessful } from '@clients/apiResult';
import type { UsersClient } from '@clients/usersClient';
import type { RegisterRequest } from '@models/registration';
import type { TestAccount } from '@models/testAccount';
import * as testLog from '@support/testLog';
import * as testValues from '@support/testValues';

/**
 * Throwaway credential for a throwaway account on a public sandbox, created and
 * abandoned inside one test. **Fixed rather than generated**, and that is the
 * shipped reasoning: a random one that occasionally failed the application's
 * complexity rules would produce a flaky *setup* step. The exact literal all three
 * shipped modules use, so a reader comparing four flows sees one value.
 */
const PASSWORD = 'Str0ng-Pass!123';

const DUPLICATE_EMAIL_STATUS = 409;
const LOCKED_STATUS = 423;

/** The password `burnUntilLocked` sends. Deliberately invalid, and never a real value. */
const WRONG_PASSWORD = 'wrong-password';

/** What a lockout attempt sequence reported, with nothing judged. */
export interface LockoutOutcome {
  /** The status of every attempt that was not the lockout, in order. */
  readonly statusesBeforeLock: readonly number[];
  /** Which attempt answered 423, or 0 when the lockout never tripped. */
  readonly lockedAtAttempt: number;
}

export class AccountFlow {
  constructor(
    private readonly usersClient: UsersClient,
    private readonly authClient: AuthClient,
  ) {}

  /**
   * Registers a fresh customer account and returns its credentials.
   *
   * Throws when registration is refused, including the duplicate case where the
   * generated address is already registered. Failing here with the status is far
   * clearer than letting every later assertion fail against a sign-in that could
   * never have worked.
   */
  async createCustomer(): Promise<TestAccount> {
    // Logged through testLog rather than recorded as an Allure step. The bare step
    // overload in the C# module started a step nothing closed and hung the suite; the
    // Playwright equivalent is safe, but this log line is what the other three modules
    // emit and parity on output matters more than a nested step here.
    testLog.info('Registering a disposable customer account via the API');

    const email = testValues.uniqueEmail();

    const request: RegisterRequest = {
      first_name: 'Af',
      last_name: 'Tester',
      address: {
        street: '1 Test Street',
        city: 'Testville',
        state: 'TS',
        country: 'PH',
        postal_code: '1000',
      },
      phone: testValues.reservedPhoneNumber(),
      dob: '1990-01-01',
      email,
      password: PASSWORD,
    };

    const result = await this.usersClient.register(request);

    if (result.status === DUPLICATE_EMAIL_STATUS) {
      throw new Error(
        `Registration was refused as a duplicate (${String(DUPLICATE_EMAIL_STATUS)}): ` +
          `the email ${email} is already registered, so two processes generated the ` +
          'same identity. Compare the runId and processTag on the "Environment ... ' +
          'resolved" line in each log: AF_RUN_ID pins the run id deliberately, but ' +
          `the process tag must differ between processes. Body: ${result.rawBody}`,
      );
    }

    if (!isSuccessful(result)) {
      throw new Error(
        `Could not register a test account (${String(result.status)}). Body: ${result.rawBody}`,
      );
    }

    // The primary breadcrumb when a 409 is being diagnosed: the job is done by
    // comparing these lines and the resolved runId/processTag across two logs, which
    // is exactly the workflow the message above instructs the reader to perform.
    testLog.info(`Registered disposable account ${email}`);

    return { email, password: PASSWORD };
  }

  /**
   * Sends wrong passwords until the API answers 423, reporting what each attempt
   * returned.
   *
   * **Asserts nothing and throws nothing.** "The lockout never tripped" is a
   * finding the test reports, not an error this flow can judge, so it comes back as
   * `lockedAtAttempt === 0`.
   *
   * The loop lives here rather than in the test for a mechanical reason as well as
   * a layering one: `playwright/no-conditional-in-test` is an error in this module
   * and the shipped Python body is a `for` with an `if`/`break`. Moving the control
   * flow into the flow layer satisfies the rule by removing the conditional rather
   * than by disabling the check, and what is left in the test is three assertions
   * with no branching at all.
   *
   * `maxAttempts` is passed in by the caller rather than hardcoded, mirroring
   * Python's `_MAXIMUM_LOCKOUT_ATTEMPTS`; the constant lives in the spec file beside
   * the test that owns it.
   */
  async burnUntilLocked(account: TestAccount, maxAttempts: number): Promise<LockoutOutcome> {
    const statusesBeforeLock: number[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.authClient.loginWith(account.email, WRONG_PASSWORD);

      // One line per attempt, which is what makes a failure here readable without a
      // re-run.
      testLog.info(`Login attempt ${String(attempt)} answered ${String(result.status)}`);

      if (result.status === LOCKED_STATUS) {
        return { statusesBeforeLock, lockedAtAttempt: attempt };
      }

      statusesBeforeLock.push(result.status);
    }

    return { statusesBeforeLock, lockedAtAttempt: 0 };
  }
}
