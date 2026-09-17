package com.company.automation.support;

import io.qameta.allure.Allure;
import io.restassured.filter.Filter;
import io.restassured.filter.FilterContext;
import io.restassured.response.Response;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.FilterableResponseSpecification;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Logs and attaches every request/response pair, with secrets removed first.
 *
 * <p>This replaces {@code AllureRestAssured} deliberately. That filter attaches headers verbatim,
 * which means the {@code Authorization} header — a live bearer token — ends up in the Allure report
 * and in CI artifacts that outlive the run. Everything here passes through {@link Redaction} before
 * it is written anywhere.
 *
 * <p>The attachment is what makes an API failure diagnosable without re-running it: the request
 * that was actually sent, the status that actually came back, and the correlation id to search
 * server logs with.
 */
public final class RedactingApiLogFilter implements Filter {

  private static final Logger log = LoggerFactory.getLogger(RedactingApiLogFilter.class);

  @Override
  public Response filter(
      FilterableRequestSpecification request,
      FilterableResponseSpecification response,
      FilterContext context) {

    String correlationId = RunContext.nextCorrelationId();
    request.header("X-Correlation-Id", correlationId);

    long startedAt = System.currentTimeMillis();
    Response result = context.next(request, response);
    long elapsedMs = System.currentTimeMillis() - startedAt;

    String requestReport = describeRequest(request, correlationId);
    String responseReport = describeResponse(result, correlationId, elapsedMs);

    log.info(
        "{} {} -> {} in {}ms [{}]",
        request.getMethod(),
        request.getURI(),
        result.getStatusCode(),
        elapsedMs,
        correlationId);
    log.debug("{}", requestReport);
    log.debug("{}", responseReport);

    Allure.addAttachment("API request " + correlationId, "text/plain", requestReport);
    Allure.addAttachment("API response " + correlationId, "text/plain", responseReport);

    return result;
  }

  private String describeRequest(FilterableRequestSpecification request, String correlationId) {
    StringBuilder out = new StringBuilder();
    out.append(request.getMethod()).append(' ').append(request.getURI()).append('\n');
    out.append("correlationId: ").append(correlationId).append('\n');
    out.append("--- headers ---\n");

    for (io.restassured.http.Header header : request.getHeaders()) {
      out.append(header.getName())
          .append(": ")
          .append(Redaction.header(header.getName(), header.getValue()))
          .append('\n');
    }

    Map<String, String> queryParams = request.getQueryParams();
    if (!queryParams.isEmpty()) {
      out.append("--- query ---\n");
      for (Map.Entry<String, String> entry : queryParams.entrySet()) {
        out.append(entry.getKey())
            .append('=')
            .append(Redaction.text(entry.getValue()))
            .append('\n');
      }
    }

    Object body = request.getBody();
    if (body != null) {
      out.append("--- body ---\n").append(Redaction.body(String.valueOf(body))).append('\n');
    }

    return out.toString();
  }

  private String describeResponse(Response result, String correlationId, long elapsedMs) {
    StringBuilder out = new StringBuilder();
    out.append("status: ").append(result.getStatusCode()).append('\n');
    out.append("elapsedMs: ").append(elapsedMs).append('\n');
    out.append("correlationId: ").append(correlationId).append('\n');
    out.append("--- headers ---\n");

    for (io.restassured.http.Header header : result.getHeaders()) {
      out.append(header.getName())
          .append(": ")
          .append(Redaction.header(header.getName(), header.getValue()))
          .append('\n');
    }

    out.append("--- body ---\n").append(Redaction.body(safeBody(result))).append('\n');
    return out.toString();
  }

  private String safeBody(Response result) {
    // A response body can legitimately be empty (204) or non-text (an image). Neither should turn
    // a real assertion failure into a confusing filter failure.
    try {
      String body = result.getBody().asString();
      if (body == null) {
        return "";
      }
      if (body.length() > 20_000) {
        return body.substring(0, 20_000) + "\n... truncated for the report ...";
      }
      return body;
    } catch (RuntimeException e) {
      return "<body could not be read as text: " + e.getClass().getSimpleName() + ">";
    }
  }
}
