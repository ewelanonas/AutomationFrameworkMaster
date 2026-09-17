package com.company.automation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.SoftAssertions.assertSoftly;

import com.company.automation.ApiTestBase;
import com.company.automation.TestPreconditions;
import com.company.automation.clients.ApiResult;
import com.company.automation.models.ApiError;
import com.company.automation.models.LoginRequest;
import com.company.automation.models.LoginResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Authentication behaviour, including the boundary cases that matter most.
 *
 * <p>The statuses asserted here were observed against the running service, not assumed. One of them
 * is worth reading twice: a login request with the {@code password} field <b>missing entirely</b>
 * returns <b>401</b>, not the 422 a validation failure would normally produce. The test asserts
 * what the API does, and the inconsistency is documented in {@code shared/contracts/README.md} as
 * something to raise with the API owners. Writing the test against the status we would prefer would
 * mean a test that fails while the product is behaving as built.
 */
@Tag("regression")
@DisplayName("Authentication API")
class AuthApiTest extends ApiTestBase {

  @Test
  @Tag("smoke")
  @DisplayName("issues a bearer token when the credentials are valid")
  void shouldIssueTokenWhenCredentialsAreValid() {
    TestPreconditions.requireCustomerCredentials(config);

    ApiResult<LoginResponse> result =
        auth.login(config.credentials().requireUsername(), config.credentials().requirePassword());

    assertThat(result.status()).as("valid credentials must be accepted").isEqualTo(200);

    LoginResponse login = result.body();
    assertSoftly(
        softly -> {
          softly.assertThat(login.accessToken()).as("a token is issued").isNotBlank();
          softly
              .assertThat(login.accessToken())
              .as("the token is a three-part JWT")
              .matches("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$");
          softly
              .assertThat(login.tokenType())
              .as("the scheme is bearer")
              .isEqualToIgnoringCase("bearer");
          softly.assertThat(login.expiresIn()).as("the token expires").isNotNull().isPositive();
        });
  }

  @Test
  @DisplayName("the issued token grants access to the caller's own profile")
  void shouldGrantAccessToOwnProfileWithIssuedToken() {
    TestPreconditions.requireCustomerCredentials(config);

    ApiResult<LoginResponse> login =
        auth.login(config.credentials().requireUsername(), config.credentials().requirePassword());
    assertThat(login.status()).isEqualTo(200);

    ApiResult<Void> profile = auth.currentUser(login.body().bearerHeaderValue());

    assertThat(profile.status())
        .as("a freshly issued token must be accepted on a protected endpoint")
        .isEqualTo(200);
  }

  @Test
  @Tag("smoke")
  @DisplayName("rejects the login when the password is wrong")
  void shouldRejectLoginWhenPasswordIsWrong() {
    TestPreconditions.requireCustomerCredentials(config);

    ApiResult<LoginResponse> result =
        auth.login(config.credentials().requireUsername(), "definitely-not-the-password");

    assertSoftly(
        softly -> {
          softly
              .assertThat(result.status())
              .as("wrong credentials are unauthorized")
              .isEqualTo(401);
          softly.assertThat(result.body()).as("no token is issued on a failed login").isNull();
        });

    ApiError error = result.error();
    assertThat(error.text()).as("the rejection is explained").isNotBlank();
    assertThat(error.text())
        .as(
            "the message must not reveal whether the account exists, which would enable enumeration")
        .doesNotContainIgnoringCase("password is incorrect")
        .doesNotContainIgnoringCase("user not found")
        .doesNotContainIgnoringCase("no such user");
    ProductCatalogueApiTest.assertThatErrorLeaksNoInternals(result.rawBody());
  }

  @Test
  @DisplayName("rejects the login when the password field is missing entirely")
  void shouldRejectLoginWhenPasswordIsMissing() {
    TestPreconditions.requireCustomerCredentials(config);

    LoginRequest incomplete = LoginRequest.withoutPassword(config.credentials().requireUsername());

    ApiResult<LoginResponse> result = auth.login(incomplete);

    // Observed behaviour: 401, not 422. Asserted as-is; see the class comment.
    assertThat(result.status())
        .as("a request missing a required field must be refused, not partially processed")
        .isEqualTo(401);
    assertThat(result.body()).as("no token is issued").isNull();
    assertThat(result.error().text()).as("the refusal is explained").isNotBlank();
  }

  @Test
  @DisplayName("rejects an unknown account without revealing that it is unknown")
  void shouldRejectLoginForUnknownAccount() {
    ApiResult<LoginResponse> result =
        auth.login(com.company.automation.support.TestValues.uniqueEmail(), "any-password");

    assertThat(result.status())
        .as("an unknown account is unauthorized, and indistinguishable from a wrong password")
        .isEqualTo(401);
    assertThat(result.body()).isNull();
  }

  @Test
  @Tag("smoke")
  @DisplayName("denies access to a protected endpoint when no token is supplied")
  void shouldDenyProtectedEndpointWhenNoTokenIsSupplied() {
    ApiResult<Void> result = auth.currentUser(null);

    assertThat(result.status())
        .as("anonymous access to a protected endpoint must be 401, never 200 and never 500")
        .isEqualTo(401);
    ProductCatalogueApiTest.assertThatErrorLeaksNoInternals(result.rawBody());
  }

  @Test
  @DisplayName("denies access to a protected endpoint when the token is tampered with")
  void shouldDenyProtectedEndpointWhenTokenIsTampered() {
    TestPreconditions.requireCustomerCredentials(config);

    ApiResult<LoginResponse> login =
        auth.login(config.credentials().requireUsername(), config.credentials().requirePassword());
    assertThat(login.status()).isEqualTo(200);

    String tampered = flipLastCharacter(login.body().accessToken());

    ApiResult<Void> result = auth.currentUser("Bearer " + tampered);

    assertThat(result.status())
        .as("a token whose signature no longer verifies must be rejected")
        .isEqualTo(401);
  }

  /**
   * Changes the final character so the JWT signature no longer verifies but the shape is intact.
   */
  private static String flipLastCharacter(String token) {
    char last = token.charAt(token.length() - 1);
    char replacement;
    if (last == 'A') {
      replacement = 'B';
    } else {
      replacement = 'A';
    }
    return token.substring(0, token.length() - 1) + replacement;
  }
}
