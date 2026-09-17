package com.company.automation.clients;

import static io.restassured.RestAssured.given;

import com.company.automation.models.LoginRequest;
import com.company.automation.models.LoginResponse;
import com.company.automation.support.ConfigLoader;
import io.restassured.response.Response;

/** Authentication endpoints. */
public final class AuthClient {

  /**
   * {@code POST /users/login}. Returns the result whatever the status — negative tests need that.
   */
  public ApiResult<LoginResponse> login(LoginRequest request) {
    String loginPath = ConfigLoader.config().api().loginPath();
    Response response =
        given()
            .spec(com.company.automation.support.ApiSpec.spec())
            .body(request)
            .when()
            .post(loginPath)
            .thenReturn();
    return ApiResult.of(response, LoginResponse.class);
  }

  /** Convenience for the common case. */
  public ApiResult<LoginResponse> login(String email, String password) {
    return login(LoginRequest.of(email, password));
  }

  /**
   * {@code GET /users/me} with an explicit Authorization header, or without one when {@code
   * bearerHeaderValue} is null.
   *
   * <p>The nullable header is deliberate: the anonymous-access case is a first-class test, not an
   * edge case, and it should not need a different method.
   */
  public ApiResult<Void> currentUser(String bearerHeaderValue) {
    io.restassured.specification.RequestSpecification request =
        given().spec(com.company.automation.support.ApiSpec.spec());
    if (bearerHeaderValue != null) {
      request = request.header("Authorization", bearerHeaderValue);
    }
    Response response = request.when().get("/users/me").thenReturn();
    return ApiResult.ofStatusOnly(response);
  }
}
