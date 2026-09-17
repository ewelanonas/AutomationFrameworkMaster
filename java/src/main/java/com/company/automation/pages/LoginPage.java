package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * The sign-in page.
 *
 * <p>{@link #submit()} does not assert success and does not return the account page, because a
 * failed login stays on this page. Deciding what happened is the test's job — that is what keeps
 * this object usable for both the happy path and the invalid-credentials case.
 */
public final class LoginPage {

  private static final String PATH = "/auth/login";

  private final Page page;

  public final Locator form;
  public final Locator emailInput;
  public final Locator passwordInput;
  public final Locator submitButton;
  public final Locator errorMessage;
  public final Locator registerLink;
  public final Locator forgotPasswordLink;

  public LoginPage(Page page) {
    this.page = page;
    this.form = page.getByTestId("login-form");
    this.emailInput = page.getByTestId("email");
    this.passwordInput = page.getByTestId("password");
    this.submitButton = page.getByTestId("login-submit");
    this.errorMessage = page.getByTestId("login-error");
    this.registerLink = page.getByTestId("register-link");
    this.forgotPasswordLink = page.getByTestId("forgot-password-link");
  }

  public LoginPage open() {
    page.navigate(PATH);
    return this;
  }

  public LoginPage enterEmail(String email) {
    emailInput.fill(email);
    return this;
  }

  public LoginPage enterPassword(String password) {
    passwordInput.fill(password);
    return this;
  }

  public LoginPage submit() {
    submitButton.click();
    return this;
  }

  /** Fills both fields and submits. Whether it succeeded is for the test to assert. */
  public LoginPage signIn(String email, String password) {
    enterEmail(email);
    enterPassword(password);
    return submit();
  }

  /** The account page object. Call only after asserting the sign-in succeeded. */
  public AccountPage accountPage() {
    return new AccountPage(page);
  }
}
