package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A successful login.
 *
 * <p>{@code toString} is overridden so the token cannot reach a log line or an assertion failure
 * message through the record's generated implementation.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record LoginResponse(
    @JsonProperty("access_token") String accessToken,
    @JsonProperty("token_type") String tokenType,
    @JsonProperty("expires_in") Integer expiresIn) {

  /** The value for an {@code Authorization} header. */
  public String bearerHeaderValue() {
    return "Bearer " + accessToken;
  }

  @Override
  public String toString() {
    return "LoginResponse[accessToken=***REDACTED***, tokenType="
        + tokenType
        + ", expiresIn="
        + expiresIn
        + "]";
  }
}
