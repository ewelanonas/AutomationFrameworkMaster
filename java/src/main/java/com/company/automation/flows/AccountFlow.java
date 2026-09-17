package com.company.automation.flows;

import com.company.automation.clients.ApiResult;
import com.company.automation.clients.UsersClient;
import com.company.automation.models.RegisterRequest;
import com.company.automation.models.TestAccount;
import com.company.automation.support.TestValues;
import io.qameta.allure.Step;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Creates disposable accounts over the API so no test depends on a shared one.
 *
 * <p>This flow exists because of a failure this suite actually caused. The negative sign-in tests
 * send a wrong password on purpose. Against the shared demo account that incremented a server-side
 * failed-attempt counter until the account locked, and the API began answering {@code 423 Locked}
 * to <i>every</i> login — including the happy paths, in this module and the C# one at the same
 * time.
 *
 * <p>The lockout was not a bug in the application. It was a test-design defect: a shared account is
 * shared mutable state, and the house rules say tests own the data they need. A per-test account
 * can be locked, abused, or left in any state at all, because nothing else will ever use it.
 *
 * <p>The accounts are not deleted afterwards: the demo API offers no self-delete, and every
 * generated address is on {@code example.invalid} with the run id embedded, so a janitor can find
 * them. In a real project this flow would register cleanup at creation time.
 */
public final class AccountFlow {

  private static final Logger log = LoggerFactory.getLogger(AccountFlow.class);

  /**
   * Fixed rather than generated: the password must satisfy the application's complexity rules, and
   * a random one that occasionally fails them would produce a flaky setup step. It is a throwaway
   * credential for a throwaway account on a public sandbox.
   */
  private static final String PASSWORD = "Str0ng-Pass!123";

  private final UsersClient usersClient = new UsersClient();

  /**
   * Registers a fresh customer account and returns its credentials.
   *
   * @throws IllegalStateException if registration is refused — failing here with the status is far
   *     clearer than letting every later assertion fail against a sign-in that could never have
   *     worked
   */
  @Step("Register a disposable customer account via the API")
  public TestAccount createCustomer() {
    String email = TestValues.uniqueEmail();

    RegisterRequest request =
        new RegisterRequest(
            "Af",
            "Tester",
            new RegisterRequest.PostalAddress("1 Test Street", "Testville", "TS", "PH", "1000"),
            "0000000000",
            "1990-01-01",
            email,
            PASSWORD);

    ApiResult<Void> result = usersClient.register(request);

    if (!result.isSuccessful()) {
      throw new IllegalStateException(
          "Could not register a test account (" + result.status() + "). Body: " + result.rawBody());
    }

    log.info("Registered disposable account {}", email);
    return new TestAccount(email, PASSWORD);
  }
}
