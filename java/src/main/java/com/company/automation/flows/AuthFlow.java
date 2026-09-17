package com.company.automation.flows;

import com.company.automation.clients.ApiResult;
import com.company.automation.clients.AuthClient;
import com.company.automation.models.LoginResponse;
import com.microsoft.playwright.BrowserContext;
import io.qameta.allure.Step;

/**
 * Gets a browser into a signed-in state without touching the login form.
 *
 * <p>This is the single highest-value flow in a UI suite. Signing in through the form before every
 * test is usually the largest waste of time in the whole run, and it makes every test depend on the
 * login screen working. Here the token is obtained over the API and injected into the browser, so
 * only the tests that are genuinely <i>about</i> logging in ever use the form.
 *
 * <p>The injection target was verified against the running application: the app reads its JWT from
 * {@code localStorage} under the key {@code auth-token}, storing the raw token string with no
 * wrapper. {@code addInitScript} installs it before any page script runs, so the app is already
 * authenticated on first paint and there is no logged-out flash to race against.
 */
public final class AuthFlow {

  private static final String TOKEN_STORAGE_KEY = "auth-token";

  private final AuthClient authClient = new AuthClient();

  /**
   * Signs in over the API and seeds the token into the context.
   *
   * @return the token, for tests that also need to call the API as this user
   * @throws IllegalStateException if the credentials are rejected — failing here, with the status,
   *     is far clearer than letting every later assertion fail against a logged-out page
   */
  @Step("Sign in as {email} via the API and seed the browser session")
  public String signInViaApi(BrowserContext context, String email, String password) {
    ApiResult<LoginResponse> result = authClient.login(email, password);

    if (!result.isSuccessful()) {
      throw new IllegalStateException(
          "Could not sign in as "
              + email
              + " to set up the test. The API returned "
              + result.status()
              + ". Check AF_AUTH_USERNAME and AF_AUTH_PASSWORD.");
    }

    String token = result.body().accessToken();
    seedToken(context, token);
    return token;
  }

  /**
   * Writes the token into {@code localStorage} for every page this context opens.
   *
   * <p>Uses {@code addInitScript} rather than navigating and then evaluating, so the value is
   * present before the application boots.
   */
  @Step("Seed the auth token into the browser context")
  public void seedToken(BrowserContext context, String token) {
    String script =
        "window.localStorage.setItem('"
            + TOKEN_STORAGE_KEY
            + "', "
            + toJavaScriptStringLiteral(token)
            + ");";
    context.addInitScript(script);
  }

  /**
   * Clears the seeded session, for a test that needs to start signed out in an existing context.
   */
  @Step("Clear the browser session")
  public void clearSession(BrowserContext context) {
    context.clearCookies();
    context.addInitScript("window.localStorage.removeItem('" + TOKEN_STORAGE_KEY + "');");
  }

  /**
   * Quotes a value for safe inclusion in a JavaScript source string.
   *
   * <p>A token is opaque and could in principle contain a quote or a backslash. Concatenating it
   * into script text unescaped is the same class of mistake as string-building SQL, so it is
   * escaped here rather than trusted.
   */
  private static String toJavaScriptStringLiteral(String value) {
    StringBuilder out = new StringBuilder("'");
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (c == '\'' || c == '\\') {
        out.append('\\').append(c);
      } else if (c == '\n') {
        out.append("\\n");
      } else if (c == '\r') {
        out.append("\\r");
      } else {
        out.append(c);
      }
    }
    return out.append('\'').toString();
  }
}
