package com.company.automation.clients;

import com.company.automation.models.ApiError;
import io.restassured.response.Response;

/**
 * The outcome of one API call: status, deserialized body, and the raw response.
 *
 * <p>This type exists so clients never throw on a non-2xx status. A 403 test and a 200 test then
 * read identically, and neither needs a try/catch. A client that throws on error statuses forces
 * every negative test into exception handling, which hides what is actually being asserted.
 *
 * <p>The body is only deserialized on success. Parsing an error body as the success type would fail
 * for the wrong reason and bury the real status code.
 *
 * @param <T> the success body type
 */
public record ApiResult<T>(int status, T body, Response raw) {

  /** Wraps a response, deserializing the body only when the status indicates success. */
  public static <T> ApiResult<T> of(Response response, Class<T> successType) {
    int status = response.getStatusCode();
    T body = null;
    if (status >= 200 && status < 300) {
      body = response.as(successType);
    }
    return new ApiResult<>(status, body, response);
  }

  /** Wraps a response with no body worth deserializing, such as a 204 or a probe for a status. */
  public static ApiResult<Void> ofStatusOnly(Response response) {
    return new ApiResult<>(response.getStatusCode(), null, response);
  }

  public boolean isSuccessful() {
    return status >= 200 && status < 300;
  }

  /** The response body as text, for schema validation and diagnostics. */
  public String rawBody() {
    return raw.getBody().asString();
  }

  /** The error body. Only meaningful for a failed call. */
  public ApiError error() {
    return raw.as(ApiError.class);
  }

  /** A response header value, or null when absent. */
  public String header(String name) {
    return raw.getHeader(name);
  }

  /** Milliseconds the call took, as measured by the HTTP client. */
  public long elapsedMs() {
    return raw.getTimeIn(java.util.concurrent.TimeUnit.MILLISECONDS);
  }
}
