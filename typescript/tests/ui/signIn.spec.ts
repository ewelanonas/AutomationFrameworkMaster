/**
 * Sign-in through the form.
 *
 * This is the one place the login form is used. Every other UI test seeds its
 * session over the API via `AuthFlow`, because signing in through the form before
 * every test is usually the largest single waste of time in a suite, and it makes
 * every unrelated test depend on the login screen working.
 *
 * Each test registers its own disposable account. The negative tests deliberately
 * fail a login, which moves an account towards a server-side lockout — and doing
 * that to a shared account locked it out from under two language modules once
 * already.
 *
 * The error message asserted here was read from the running application. Note that
 * the UI says "Invalid email or password" while the API says "Unauthorized" for the
 * same rejection: different layers, different wording, and a test that assumed they
 * matched would fail for no useful reason. That is why the two are asserted
 * separately, here and in `tests/api/auth.spec.ts`.
 */

import { AccountPage } from '@pages/accountPage';
import { LoginPage } from '@pages/loginPage';
import { expect, uiTest as test } from '@support/fixtures';
import * as testValues from '@support/testValues';

const REJECTION_MESSAGE = 'Invalid email or password';

// A deliberately invalid value, not a credential. Obviously fake by construction.
const WRONG_PASSWORD = 'definitely-not-the-password';
const ANY_PASSWORD = 'any-password';

test.describe('Sign in', () => {
  test(
    'reaches the account page when the credentials are valid',
    { tag: ['@smoke', '@regression'] },
    async ({ page, disposableAccount }) => {
      const login = new LoginPage(page);
      await login.open();

      await login.signIn(disposableAccount.email, disposableAccount.password);

      const accountPage = login.accountPage();

      await expect(page).toHaveURL(/.*\/account.*/);
      await expect(accountPage.pageTitle).toBeVisible();
      await expect(accountPage.userMenu).toBeVisible();
    },
  );

  test(
    'shows an error when the password is wrong',
    { tag: ['@smoke', '@regression'] },
    async ({ page, disposableAccount }) => {
      const login = new LoginPage(page);
      await login.open();

      await login.signIn(disposableAccount.email, WRONG_PASSWORD);

      await expect(login.errorMessage).toBeVisible();
      await expect(login.errorMessage).toHaveText(REJECTION_MESSAGE);

      // Staying on the form matters as much as the message: a failed login that
      // navigated away would leave the user with no way to correct the mistake.
      await expect(login.form).toBeVisible();
      await expect(page).toHaveURL(/.*\/auth\/login.*/);
    },
  );

  test(
    'does not reveal whether the account exists when the email is unknown',
    { tag: ['@regression'] },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.open();

      await login.signIn(testValues.uniqueEmail(), ANY_PASSWORD);

      // The same wording as the wrong-password case, deliberately. A distinct message
      // here would let anyone enumerate which email addresses hold accounts.
      await expect(login.errorMessage).toHaveText(REJECTION_MESSAGE);
    },
  );

  test(
    'skips the login form when the session is seeded via the API',
    { tag: ['@regression'] },
    async ({ page, context, authFlow, disposableAccount }) => {
      // The mechanism every other UI test depends on, so a regression in AuthFlow is
      // reported here rather than as a confusing cascade of unrelated failures.
      await authFlow.signInViaApi(context, disposableAccount.email, disposableAccount.password);

      const accountPage = new AccountPage(page);
      await accountPage.open();

      // No form was touched.
      await expect(accountPage.pageTitle).toBeVisible();
      await expect(accountPage.userMenu).toBeVisible();
    },
  );
});
