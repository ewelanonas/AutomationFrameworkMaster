/**
 * The sign-in page.
 *
 * `submit()` does **not** assert success and does **not** return the account page,
 * because a failed login stays on this page. Deciding what happened is the test's
 * job — that is what keeps this object usable for both the happy path and the
 * invalid-credentials case.
 */

import type { Locator, Page } from '@playwright/test';

import * as navigation from '@support/navigation';

import { AccountPage } from './accountPage';

const PATH = '/auth/login';

export class LoginPage {
  private readonly page: Page;

  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly registerLink: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.getByTestId('login-form');
    this.emailInput = page.getByTestId('email');
    this.passwordInput = page.getByTestId('password');
    this.submitButton = page.getByTestId('login-submit');
    this.errorMessage = page.getByTestId('login-error');
    this.registerLink = page.getByTestId('register-link');
    this.forgotPasswordLink = page.getByTestId('forgot-password-link');
  }

  async open(): Promise<LoginPage> {
    await navigation.toPath(this.page, PATH);

    return this;
  }

  async enterEmail(email: string): Promise<LoginPage> {
    await this.emailInput.fill(email);

    return this;
  }

  async enterPassword(password: string): Promise<LoginPage> {
    await this.passwordInput.fill(password);

    return this;
  }

  async submit(): Promise<LoginPage> {
    await this.submitButton.click();

    return this;
  }

  /** Fills both fields and submits. Whether it succeeded is for the test to assert. */
  async signIn(email: string, password: string): Promise<LoginPage> {
    await this.enterEmail(email);
    await this.enterPassword(password);

    return this.submit();
  }

  /** The account page object. Call only after asserting the sign-in succeeded. */
  accountPage(): AccountPage {
    return new AccountPage(this.page);
  }
}
