package com.company.automation.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaValidatorsConfig;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Validates real responses against the JSON Schemas in {@code shared/contracts/}.
 *
 * <p>The schemas set {@code additionalProperties: false}, so this catches a field the service
 * quietly added or renamed — the change that otherwise goes unnoticed until something downstream
 * breaks.
 *
 * <p>The draft version is declared here rather than inline in each schema file, so every module
 * validates against the same dialect.
 */
public final class SchemaValidator {

  private static final SpecVersion.VersionFlag DIALECT = SpecVersion.VersionFlag.V202012;
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Map<String, JsonSchema> CACHE = new HashMap<>();

  private SchemaValidator() {}

  /**
   * Returns the validation failures for {@code json} against the named schema. An empty list means
   * the payload conforms.
   *
   * @param schemaFileName file name inside {@code shared/contracts/}, e.g. {@code
   *     toolshop-product.schema.json}
   */
  public static List<String> validate(String schemaFileName, String json) {
    JsonNode payload = parse(json);
    JsonSchema schema = schemaFor(schemaFileName);

    Set<ValidationMessage> failures = schema.validate(payload);

    List<String> messages = new ArrayList<>();
    for (ValidationMessage failure : failures) {
      messages.add(failure.getMessage());
    }
    return messages;
  }

  private static synchronized JsonSchema schemaFor(String schemaFileName) {
    JsonSchema cached = CACHE.get(schemaFileName);
    if (cached != null) {
      return cached;
    }

    Path path = RepoPaths.contracts().resolve(schemaFileName);
    if (!Files.isRegularFile(path)) {
      throw new IllegalStateException(
          "No schema at " + path + ". Contracts live in shared/contracts/ and are committed.");
    }

    // Relative $ref between schema files (paged -> product) resolves against this directory.
    JsonSchemaFactory factory = JsonSchemaFactory.getInstance(DIALECT);

    SchemaValidatorsConfig config = new SchemaValidatorsConfig();
    config.setPathType(com.networknt.schema.PathType.JSON_POINTER);

    try {
      String schemaText = Files.readString(path, StandardCharsets.UTF_8);
      JsonSchema schema = factory.getSchema(path.toUri(), MAPPER.readTree(schemaText), config);
      CACHE.put(schemaFileName, schema);
      return schema;
    } catch (IOException e) {
      throw new IllegalStateException("Could not read the schema at " + path, e);
    }
  }

  private static JsonNode parse(String json) {
    try {
      return MAPPER.readTree(json);
    } catch (IOException e) {
      throw new IllegalStateException(
          "Response body is not valid JSON, so it cannot be validated against a schema. "
              + "Body starts: "
              + Redaction.body(preview(json)),
          e);
    }
  }

  private static String preview(String json) {
    if (json == null) {
      return "<null>";
    }
    if (json.length() <= 300) {
      return json;
    }
    return json.substring(0, 300) + "...";
  }
}
