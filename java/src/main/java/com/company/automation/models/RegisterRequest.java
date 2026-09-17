package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Payload for {@code POST /users/register}.
 *
 * <p>{@code toString} is overridden because this record carries a password. A record's generated
 * one prints every component, which would put the password into any log line or assertion message
 * that touched it.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RegisterRequest(
    @JsonProperty("first_name") String firstName,
    @JsonProperty("last_name") String lastName,
    @JsonProperty("address") PostalAddress address,
    @JsonProperty("phone") String phone,
    @JsonProperty("dob") String dateOfBirth,
    @JsonProperty("email") String email,
    @JsonProperty("password") String password) {

  @Override
  public String toString() {
    return "RegisterRequest[email=" + email + ", password=***REDACTED***]";
  }

  /** A postal address, as the registration endpoint expects it. */
  public record PostalAddress(
      @JsonProperty("street") String street,
      @JsonProperty("city") String city,
      @JsonProperty("state") String state,
      @JsonProperty("country") String country,
      @JsonProperty("postal_code") String postalCode) {}
}
