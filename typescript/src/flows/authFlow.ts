/**
 * Gets a browser into a signed-in state without touching the login form.
 *
 * This is the single highest-value flow in a UI suite. Signing in through the form
 * before every test is usually the largest waste of time in the whole run, and it
 * makes every test depend on the login screen working. Here the token is obtained
 * over the API and injected into the browser, so only the tests that are genuinely
 * *about* logging in ever use the form.
 *
 * The injection target was read from the running application and is unchanged from
 * the shipped modules: the JWT lives in `localStorage` under `auth-token`, as a raw
 * string with no wrapper. `context.addInitScript` installs it before any page
 * script runs, so the app is authenticated on first paint with no logged-out flash
 * to race against.
 *
 * `BrowserContext` is imported as a **type only**. This flow does not import
 * `test`: there is no Allure step here and therefore no
 * `fixtures -> flows -> fixtures` cycle to avoid in the first place.
 */

import type { BrowserContext } from '@playwright/test';

import { isSuccessful } from '@clients/apiResult';
import type { AuthClient } from '@clients/authClient';
import * as testLog from '@support/testLog';

/** A `localStorage` key name, not a token. */
const TOKEN_STORAGE_KEY = 'auth-token';

export class AuthFlow {
  constructor(private readonly authClient: AuthClient) {}

  /**
   * Signs in over the API and seeds the token into the context.
   *
   * Returns the token, for a test that also needs to call the API as this user.
   * Throws naming the email and the status when the credentials are rejected:
   * failing here is far clearer than letting every later assertion fail against a
   * logged-out page.
   */
  async signInViaApi(context: BrowserContext, email: string, password: string): Promise<string> {
    testLog.info(`Signing in as ${email} via the API and seeding the browser session`);

    const result = await this.authClient.loginWith(email, password);

    if (!isSuccessful(result) || result.body === undefined) {
      throw new Error(
        `Could not sign in as ${email} to set up the test. ` +
          `The API returned ${String(result.status)}.`,
      );
    }

    const token = result.body.access_token;
    await AuthFlow.seedToken(context, token);

    return token;
  }

  /**
   * Writes the token into `localStorage` for every page this context opens.
   *
   * An init script rather than navigating and then evaluating, so the value is
   * present before the application boots.
   *
   * The token is quoted with `JSON.stringify`, **never concatenated**. A token is
   * opaque and could in principle contain a quote or a backslash, and splicing it
   * into script text unescaped is the same class of mistake as string-building SQL.
   * `JSON.stringify` produces a valid JavaScript string literal for any JSON-safe
   * input.
   */
  static async seedToken(context: BrowserContext, token: string): Promise<void> {
    const key = JSON.stringify(TOKEN_STORAGE_KEY);
    const value = JSON.stringify(token);

    await context.addInitScript(`window.localStorage.setItem(${key}, ${value});`);
  }

  /** Clears the seeded session, for a test starting signed out in an existing context. */
  static async clearSession(context: BrowserContext): Promise<void> {
    const key = JSON.stringify(TOKEN_STORAGE_KEY);

    await context.clearCookies();
    await context.addInitScript(`window.localStorage.removeItem(${key});`);
  }
}
