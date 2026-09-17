package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Image metadata attached to a product, including its attribution. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProductImage(
    @JsonProperty("id") String id,
    @JsonProperty("file_name") String fileName,
    @JsonProperty("title") String title,
    @JsonProperty("by_name") String byName,
    @JsonProperty("by_url") String byUrl,
    @JsonProperty("source_name") String sourceName,
    @JsonProperty("source_url") String sourceUrl) {}
