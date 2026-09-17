package com.company.automation.support;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Single place every log line and report attachment passes through before it is written.
 *
 * <p>This class exists because a trace, an Allure attachment, and a CI log all outlive the run and
 * are readable by more people than the test author expects. A token that reaches any of them cannot
 * be un-leaked.
 *
 * <p>Redaction replaces with a fixed marker. It never partially reveals a value and never reports
 * its length, because both leak information about the secret.
 */
public final class Redaction {

  public static final String MARKER = "***REDACTED***";

  /** Header names redacted regardless of value. */
  private static final List<String> SENSITIVE_HEADERS =
      Arrays.asList("authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key");

  /** JSON field names redacted regardless of value. */
  private static final List<String> SENSITIVE_FIELDS =
      Arrays.asList(
          "password",
          "passwd",
          "current_password",
          "new_password",
          "password_confirmation",
          "token",
          "access_token",
          "refresh_token",
          "id_token",
          "secret",
          "client_secret",
          "api_key",
          "apikey",
          "authorization",
          "ssn",
          "card",
          "card_number",
          "cvv",
          "pin");

  /** {@code "field": "value"} or {@code "field": 123} in a JSON body. */
  private static final Pattern JSON_FIELD =
      Pattern.compile("(\"(?<key>[A-Za-z0-9_\\-]+)\"\\s*:\\s*)(\"[^\"]*\"|[^,}\\s]+)");

  /** A JWT anywhere in free text, including inside a URL query string. */
  private static final Pattern JWT =
      Pattern.compile("eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}");

  /** {@code Bearer <token>} in free text. */
  private static final Pattern BEARER = Pattern.compile("(?i)(bearer\\s+)([A-Za-z0-9._\\-]{8,})");

  /** A run of 13 to 19 digits, the shape of a payment card number. */
  private static final Pattern CARD_LIKE = Pattern.compile("\\b\\d{13,19}\\b");

  private Redaction() {}

  /** True when a header of this name must never have its value written out. */
  public static boolean isSensitiveHeader(String headerName) {
    if (headerName == null) {
      return false;
    }
    String lower = headerName.toLowerCase(Locale.ROOT);
    for (String sensitive : SENSITIVE_HEADERS) {
      if (lower.equals(sensitive)) {
        return true;
      }
    }
    return false;
  }

  /** Redacts a single header value, returning the marker when the name is sensitive. */
  public static String header(String headerName, String value) {
    if (isSensitiveHeader(headerName)) {
      return MARKER;
    }
    return text(value);
  }

  /**
   * Redacts a body or free-text blob: sensitive JSON fields by name, then token shapes by pattern.
   *
   * <p>Both passes run, because a token can arrive either as a named field or embedded in a URL.
   */
  public static String body(String content) {
    if (content == null || content.isEmpty()) {
      return content;
    }
    return text(redactJsonFields(content));
  }

  /** Redacts token-shaped and card-shaped substrings in any text. */
  public static String text(String content) {
    if (content == null || content.isEmpty()) {
      return content;
    }
    String result = JWT.matcher(content).replaceAll(MARKER);
    result = BEARER.matcher(result).replaceAll("$1" + MARKER);
    result = CARD_LIKE.matcher(result).replaceAll(MARKER);
    return result;
  }

  private static String redactJsonFields(String content) {
    Matcher matcher = JSON_FIELD.matcher(content);
    StringBuilder out = new StringBuilder();

    while (matcher.find()) {
      String key = matcher.group("key");
      String replacement;
      if (isSensitiveField(key)) {
        replacement = matcher.group(1) + "\"" + MARKER + "\"";
      } else {
        replacement = matcher.group(0);
      }
      matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
    }
    matcher.appendTail(out);

    return out.toString();
  }

  private static boolean isSensitiveField(String fieldName) {
    String lower = fieldName.toLowerCase(Locale.ROOT);
    for (String sensitive : SENSITIVE_FIELDS) {
      if (lower.equals(sensitive)) {
        return true;
      }
    }
    return false;
  }
}
