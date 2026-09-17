package com.company.automation.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Builds the {@link Config} once per JVM, resolving values lowest precedence first:
 *
 * <ol>
 *   <li>{@code shared/environments/<env>.json} — non-secret defaults, committed
 *   <li>{@code .env} at the repository root — local overrides, gitignored
 *   <li>Real process environment variables — always win, this is how CI injects secrets
 * </ol>
 *
 * <p>Resolution fails loudly and names every missing key. It never falls back to a production URL,
 * and never substitutes a blank for a missing setting: a suite that silently points somewhere
 * unexpected is worse than one that refuses to start.
 */
public final class ConfigLoader {

  private static final Logger log = LoggerFactory.getLogger(ConfigLoader.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static Config cached;

  private ConfigLoader() {}

  /** The resolved configuration for this JVM. Safe to call from many threads. */
  public static synchronized Config config() {
    if (cached == null) {
      cached = load();
      logResolvedTargets(cached);
    }
    return cached;
  }

  private static Config load() {
    String envName = resolveEnvName();
    JsonNode file = readEnvironmentFile(envName);
    Map<String, String> overrides = readDotEnvFile();

    List<String> missing = new ArrayList<>();

    String uiBaseUrl = valueOf("AF_UI_BASEURL", overrides, file.path("ui").path("baseUrl"));
    String apiBaseUrl = valueOf("AF_API_BASEURL", overrides, file.path("api").path("baseUrl"));

    if (isBlank(uiBaseUrl)) {
      missing.add("ui.baseUrl (or AF_UI_BASEURL)");
    }
    if (isBlank(apiBaseUrl)) {
      missing.add("api.baseUrl (or AF_API_BASEURL)");
    }
    if (!missing.isEmpty()) {
      throw new IllegalStateException(
          "Configuration is incomplete for environment '"
              + envName
              + "'. Missing: "
              + String.join(", ", missing)
              + ". Checked shared/environments/"
              + envName
              + ".json, the .env file, and process environment variables.");
    }

    Config.Ui ui =
        new Config.Ui(
            stripTrailingSlash(uiBaseUrl),
            textOr(file.path("ui").path("locale"), "en-US"),
            textOr(file.path("ui").path("timezoneId"), "UTC"),
            intOr(file.path("ui").path("viewport").path("width"), 1440),
            intOr(file.path("ui").path("viewport").path("height"), 900));

    Config.Api api =
        new Config.Api(
            stripTrailingSlash(apiBaseUrl),
            textOr(file.path("api").path("loginPath"), "/users/login"));

    Config.Timeouts timeouts =
        new Config.Timeouts(
            intOr(file.path("timeouts").path("elementMs"), 10_000),
            intOr(file.path("timeouts").path("navigationMs"), 30_000),
            intOr(file.path("timeouts").path("apiMs"), 30_000),
            intOr(file.path("timeouts").path("workflowMs"), 60_000));

    Config.Execution execution =
        new Config.Execution(
            booleanOf("AF_HEADLESS", overrides, file.path("execution").path("headless"), true),
            textOf("AF_BROWSER", overrides, file.path("execution").path("browser"), "chromium"),
            textOr(file.path("execution").path("testIdAttribute"), "data-testid"));

    Config.Credentials credentials =
        new Config.Credentials(
            environmentValue("AF_AUTH_USERNAME", overrides),
            environmentValue("AF_AUTH_PASSWORD", overrides),
            environmentValue("AF_AUTH_ADMIN_USERNAME", overrides),
            environmentValue("AF_AUTH_ADMIN_PASSWORD", overrides));

    return new Config(envName, ui, api, timeouts, execution, credentials);
  }

  private static void logResolvedTargets(Config config) {
    // Logged once, and deliberately: the single most common wasted debugging hour is a suite
    // that was pointing somewhere other than where the engineer assumed.
    log.info(
        "Environment '{}' resolved. UI={} API={} headless={} browser={} testIdAttribute={} runId={}",
        config.envName(),
        config.ui().baseUrl(),
        config.api().baseUrl(),
        config.execution().headless(),
        config.execution().browser(),
        config.execution().testIdAttribute(),
        RunContext.runId());
  }

  private static String resolveEnvName() {
    String fromSystemProperty = System.getProperty("af.env");
    if (!isBlank(fromSystemProperty)) {
      return fromSystemProperty.trim();
    }
    String fromEnvironment = System.getenv("AF_ENV");
    if (!isBlank(fromEnvironment)) {
      return fromEnvironment.trim();
    }
    return "local";
  }

  private static JsonNode readEnvironmentFile(String envName) {
    Path path = RepoPaths.environments().resolve(envName + ".json");
    if (!Files.isRegularFile(path)) {
      throw new IllegalStateException(
          "No environment descriptor at "
              + path
              + ". Create it, or select another with -Daf.env=<name>.");
    }
    try {
      return MAPPER.readTree(Files.readString(path, StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new IllegalStateException("Could not read the environment descriptor at " + path, e);
    }
  }

  /**
   * Reads {@code .env} at the repository root if it exists. Absent is normal — CI injects real
   * environment variables instead.
   */
  private static Map<String, String> readDotEnvFile() {
    Map<String, String> values = new HashMap<>();
    Path path = RepoPaths.repoRoot().resolve(".env");
    if (!Files.isRegularFile(path)) {
      return values;
    }

    List<String> lines;
    try {
      lines = Files.readAllLines(path, StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new IllegalStateException("Could not read " + path, e);
    }

    for (String rawLine : lines) {
      String line = rawLine.trim();
      if (line.isEmpty() || line.startsWith("#")) {
        continue;
      }
      int separator = line.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      String key = line.substring(0, separator).trim();
      String value = unquote(line.substring(separator + 1).trim());
      if (!value.isEmpty()) {
        values.put(key, value);
      }
    }
    return values;
  }

  private static String unquote(String value) {
    if (value.length() >= 2) {
      boolean doubleQuoted = value.startsWith("\"") && value.endsWith("\"");
      boolean singleQuoted = value.startsWith("'") && value.endsWith("'");
      if (doubleQuoted || singleQuoted) {
        return value.substring(1, value.length() - 1);
      }
    }
    return value;
  }

  /** Process environment beats .env; .env beats nothing. Neither falls back to the JSON file. */
  private static String environmentValue(String variableName, Map<String, String> dotEnv) {
    String fromProcess = System.getenv(variableName);
    if (!isBlank(fromProcess)) {
      return fromProcess.trim();
    }
    String fromDotEnv = dotEnv.get(variableName);
    if (!isBlank(fromDotEnv)) {
      return fromDotEnv.trim();
    }
    return null;
  }

  private static String valueOf(
      String variableName, Map<String, String> dotEnv, JsonNode fallback) {
    String fromEnvironment = environmentValue(variableName, dotEnv);
    if (fromEnvironment != null) {
      return fromEnvironment;
    }
    if (fallback.isTextual()) {
      return fallback.asText();
    }
    return null;
  }

  private static String textOf(
      String variableName, Map<String, String> dotEnv, JsonNode fallback, String defaultValue) {
    String resolved = valueOf(variableName, dotEnv, fallback);
    if (isBlank(resolved)) {
      return defaultValue;
    }
    return resolved;
  }

  private static boolean booleanOf(
      String variableName, Map<String, String> dotEnv, JsonNode fallback, boolean defaultValue) {
    String fromEnvironment = environmentValue(variableName, dotEnv);
    if (fromEnvironment != null) {
      return Boolean.parseBoolean(fromEnvironment);
    }
    if (fallback.isBoolean()) {
      return fallback.asBoolean();
    }
    return defaultValue;
  }

  private static String textOr(JsonNode node, String defaultValue) {
    if (node.isTextual() && !node.asText().isBlank()) {
      return node.asText();
    }
    return defaultValue;
  }

  private static int intOr(JsonNode node, int defaultValue) {
    if (node.isInt() || node.isLong()) {
      return node.asInt();
    }
    return defaultValue;
  }

  private static String stripTrailingSlash(String url) {
    if (url.endsWith("/")) {
      return url.substring(0, url.length() - 1);
    }
    return url;
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
