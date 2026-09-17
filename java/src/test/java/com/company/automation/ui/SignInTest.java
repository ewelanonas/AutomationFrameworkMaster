package com.company.automation.ui;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

import com.company.automation.TestPreconditions;
import com.company.automation.UiTestBase;
import com.company.automation.pages.AccountPage;
import com.company.automation.pages.LoginPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Sign-in through the form.
 *
 * <p>This is the one place the login form is used. Every other UI test seeds its session over the
 * API via {@link com.company.automation.flows.AuthFlow}, because signing in through the form before
 * every test is usually the largest single waste of time in a suite, and it makes every unrelated
 * test depend on the login screen working.
 *
 * <p>The error message asserted here was read from the running application. Note that the UI says
 * "Invalid email or password" while the API says "Unauthorized" for the same rejection — different
 * layers, different wording, and a test that assumes they match would fail for no useful reason.
 */
@Tag("regression")
@DisplayName("Sign in")
class SignInTest extends UiTestBase {

  @Test
  @Tag("smoke")
  @DisplayName("reaches the account page when the credentials are valid")
  void shouldReachAccountPageWhenCredentialsAreValid() {
    TestPreconditions.requireCustomerCredentials(config);

    LoginPage login = new LoginPage(page()).open();

    login.signIn(config.credentials().requireUsername(), config.credentials().requirePassword());

    AccountPage account = login.accountPage();
    assertThat(page()).hasURL(java.util.regex.Pattern.compile(".*/account.*"));
    assertThat(account.pageTitle).isVisible();
    assertThat(account.userMenu).isVisible();
  }

  @Test
  @Tag("smoke")
  @DisplayName("shows an error and stays on the form when the password is wrong")
  void shouldShowErrorWhenPasswordIsWrong() {
    TestPreconditions.requireCustomerCredentials(config);

    LoginPage login = new LoginPage(page()).open();

    login.signIn(config.credentials().requireUsername(), "definitely-not-the-password");

    assertThat(login.errorMessage).isVisible();
    assertThat(login.errorMessage).hasText("Invalid email or password");

    // Staying on the form matters as much as the message: a failed login that navigates away would
    // leave the user with no way to correct the mistake.
    assertThat(login.form).isVisible();
    assertThat(page()).hasURL(java.util.regex.Pattern.compile(".*/auth/login.*"));
  }

  @Test
  @DisplayName("does not reveal whether the account exists when the email is unknown")
  void shouldNotRevealWhetherAccountExists() {
    LoginPage login = new LoginPage(page()).open();

    login.signIn(com.company.automation.support.TestValues.uniqueEmail(), "any-password");

    // The same wording as a wrong password, deliberately. A distinct message here would let anyone
    // enumerate which email addresses hold accounts.
    assertThat(login.errorMessage).hasText("Invalid email or password");
  }

  @Test
  @DisplayName("skips the login form entirely when the session is seeded over the API")
  void shouldSkipLoginFormWhenSessionIsSeededViaApi() {
    TestPreconditions.requireCustomerCredentials(config);

    authFlow.signInViaApi(
        browserContext(),
        config.credentials().requireUsername(),
        config.credentials().requirePassword());

    AccountPage account = new AccountPage(page()).open();

    // No form was touched. This is the pattern every other UI test in the suite uses, and it is
    // worth
    // one test of its own so a regression in the seeding mechanism is reported here rather than as
    // a
    // confusing cascade of unrelated failures.
    assertThat(account.pageTitle).isVisible();
    assertThat(account.userMenu).isVisible();
  }
}
