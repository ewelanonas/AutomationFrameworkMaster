package com.company.automation.clients;

import static io.restassured.RestAssured.given;

import com.company.automation.models.RegisterRequest;
import com.company.automation.support.ApiSpec;
import io.restassured.response.Response;

/** User account endpoints. */
public final class UsersClient {

  /** {@code POST /users/register}. Returns the result whatever the status. */
  public ApiResult<Void> register(RegisterRequest request) {
    Response response =
        given().spec(ApiSpec.spec()).body(request).when().post("/users/register").thenReturn();
    return ApiResult.ofStatusOnly(response);
  }
}
