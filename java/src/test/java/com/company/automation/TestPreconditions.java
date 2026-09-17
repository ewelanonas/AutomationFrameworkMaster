package com.company.automation;

import com.company.automation.support.Config;
import org.junit.jupiter.api.Assumptions;

/**
 * Environment prerequisites, expressed as assumptions rather than failures.
 *
 * <p>A test that needs a credential nobody has configured is not failing — the environment is
 * incomplete. Aborting with a message that names the exact variable keeps a fresh clone green while
 * still telling the reader precisely what to set, which a red suite full of 401s does not.
 *
 * <p>This is not a way to hide broken tests. It applies only to a missing local prerequisite, and
 * CI supplies these variables, so a skip there is a pipeline configuration bug and should be
 * treated as one.
 */
public final class TestPreconditions {

  private TestPreconditions() {}

  /** Aborts the test unless customer credentials are configured. */
  public static void requireCustomerCredentials(Config config) {
    boolean configured =
        isSet(config.credentials().username()) && isSet(config.credentials().password());

    Assumptions.assumeTrue(
        configured,
        "Skipped: this test signs in, which needs AF_AUTH_USERNAME and AF_AUTH_PASSWORD. "
            + "Copy .env.example to .env and fill them in — it lists the demo values.");
  }

  private static boolean isSet(String value) {
    return value != null && !value.isBlank();
  }
}
