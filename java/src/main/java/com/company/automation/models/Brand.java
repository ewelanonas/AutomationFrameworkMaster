package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A product brand.
 *
 * <p>Wire names are mapped explicitly with {@link JsonProperty} rather than by a global naming
 * strategy. It is more typing and it means anyone can see what the API actually sends without
 * knowing how the mapper is configured.
 *
 * <p>{@code ignoreUnknown = true} is right for workflow models: a field the service adds should not
 * break unrelated tests. Contract tests catch additions on purpose, through JSON Schema.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Brand(
    @JsonProperty("id") String id,
    @JsonProperty("name") String name,
    @JsonProperty("slug") String slug) {}
