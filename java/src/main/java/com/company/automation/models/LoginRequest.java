package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Credentials for {@code POST /users/login}.
 *
 * <p>{@code NON_NULL} inclusion is what lets a negative test omit a field entirely — sending {@code
 * {"email": "..."}} with no password key at all — rather than sending an explicit null. Those are
 * different requests, and APIs frequently treat them differently.
 *
 * <p>{@code toString} is overridden because a record's generated one prints every component, and
 * this record holds a password. A model that leaks its own secret into a log line defeats the
 * redaction layer entirely.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoginRequest(
    @JsonProperty("email") String email, @JsonProperty("password") String password) {

  public static LoginRequest of(String email, String password) {
    return new LoginRequest(email, password);
  }

  /** A request with no password key at all, for the missing-required-field case. */
  public static LoginRequest withoutPassword(String email) {
    return new LoginRequest(email, null);
  }

  @Override
  public String toString() {
    return "LoginRequest[email=" + email + ", password=***REDACTED***]";
  }
}
