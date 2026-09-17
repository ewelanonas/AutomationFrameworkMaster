package com.company.automation.support;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.config.HttpClientConfig;
import io.restassured.config.ObjectMapperConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;

/**
 * One shared REST Assured request specification: base URI, content type, timeouts, and the
 * redacting log filter.
 *
 * <p>Built once and reused. Creating a specification per call loses the shared filter, which is
 * what produces the report attachments, and makes the timeout policy easy to forget.
 */
public final class ApiSpec {

  private static RequestSpecification cached;

  private ApiSpec() {}

  /** The shared specification. Callers add path, params, and body; they never set the base URI. */
  public static synchronized RequestSpecification spec() {
    if (cached == null) {
      cached = build();
    }
    return cached;
  }

  private static RequestSpecification build() {
    Config config = ConfigLoader.config();
    int timeoutMs = config.timeouts().apiMs();

    RestAssuredConfig restAssuredConfig =
        RestAssuredConfig.config()
            .httpClient(
                HttpClientConfig.httpClientConfig()
                    .setParam("http.connection.timeout", timeoutMs)
                    .setParam("http.socket.timeout", timeoutMs))
            // Unknown properties are ignored here so a new field added by the service does not
            // break
            // every workflow test. Contract tests catch additions deliberately, via JSON Schema
            // with
            // additionalProperties:false — that is the right place for strictness.
            .objectMapperConfig(ObjectMapperConfig.objectMapperConfig());

    return new RequestSpecBuilder()
        .setBaseUri(config.api().baseUrl())
        .setContentType(ContentType.JSON)
        .setAccept(ContentType.JSON)
        .setConfig(restAssuredConfig)
        .addFilter(new RedactingApiLogFilter())
        .build();
  }
}
