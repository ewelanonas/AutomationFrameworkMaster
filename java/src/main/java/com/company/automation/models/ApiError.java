package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * An error body.
 *
 * <p>The demo API is inconsistent: some endpoints return {@code {"message": "..."}} and others
 * {@code {"error": "..."}}. Both are modelled, and {@link #text()} returns whichever is present.
 *
 * <p>This is modelled as-is rather than normalised behind a single field, because a test asserting
 * on a tidied-up view would hide the inconsistency instead of documenting it. The inconsistency is
 * a finding worth raising with the API owners.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiError(
    @JsonProperty("message") String message, @JsonProperty("error") String error) {

  /** The human-readable text, whichever field carried it. Null when neither is present. */
  public String text() {
    if (message != null && !message.isBlank()) {
      return message;
    }
    if (error != null && !error.isBlank()) {
      return error;
    }
    return null;
  }
}
