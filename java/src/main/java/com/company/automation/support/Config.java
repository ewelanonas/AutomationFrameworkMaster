package com.company.automation.support;

/**
 * Typed, immutable view of the resolved environment.
 *
 * <p>Nothing in the suite reads {@code System.getenv} directly. Everything goes through this
 * record, so there is exactly one place to look when a value is wrong and exactly one place to
 * change when a new setting is added.
 *
 * <p>Credentials are deliberately accessed through {@link Credentials#requireUsername()} rather
 * than a plain getter. That way a suite of API and contract tests that needs no login still runs,
 * while a test that does need one fails immediately with a message naming the missing variable,
 * instead of sending an empty password and reporting a puzzling 401.
 */
public record Config(
    String envName,
    Ui ui,
    Api api,
    Timeouts timeouts,
    Execution execution,
    Credentials credentials) {

  /**
   * Browser-facing settings. Locale and timezone are pinned so date formatting is deterministic.
   */
  public record Ui(
      String baseUrl, String locale, String timezoneId, int viewportWidth, int viewportHeight) {}

  /** Service-facing settings. */
  public record Api(String baseUrl, String loginPath) {}

  /**
   * The single timeout policy. Tests and page objects never write a millisecond literal; they ask
   * for the named timeout that matches what they are waiting on.
   */
  public record Timeouts(int elementMs, int navigationMs, int apiMs, int workflowMs) {}

  /** How the run executes. {@code testIdAttribute} is per-application, not universal. */
  public record Execution(boolean headless, String browser, String testIdAttribute) {}

  /** Test-account credentials, supplied only through the environment. */
  public record Credentials(
      String username, String password, String adminUsername, String adminPassword) {

    public String requireUsername() {
      return require(username, "AF_AUTH_USERNAME");
    }

    public String requirePassword() {
      return require(password, "AF_AUTH_PASSWORD");
    }

    public String requireAdminUsername() {
      return require(adminUsername, "AF_AUTH_ADMIN_USERNAME");
    }

    public String requireAdminPassword() {
      return require(adminPassword, "AF_AUTH_ADMIN_PASSWORD");
    }

    private static String require(String value, String variableName) {
      if (value == null || value.isBlank()) {
        throw new IllegalStateException(
            "This test needs a credential that is not configured: "
                + variableName
                + ". Copy .env.example to .env and fill it in, or export the variable. "
                + "See .env.example for the demo values.");
      }
      return value;
    }
  }
}
