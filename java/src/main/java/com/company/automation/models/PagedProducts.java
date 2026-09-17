package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * The pagination envelope the catalogue returns.
 *
 * <p>{@code from} and {@code to} are nullable: on an empty result the API sends null for both,
 * which is exactly the case a pagination test needs to cover.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PagedProducts(
    @JsonProperty("current_page") int currentPage,
    @JsonProperty("data") List<Product> data,
    @JsonProperty("from") Integer from,
    @JsonProperty("to") Integer to,
    @JsonProperty("last_page") int lastPage,
    @JsonProperty("per_page") int perPage,
    @JsonProperty("total") int total) {

  /** True when this page carries no items. */
  public boolean isEmpty() {
    return data == null || data.isEmpty();
  }

  /** Number of items on this page, 0 when the page is empty. */
  public int size() {
    if (data == null) {
      return 0;
    }
    return data.size();
  }

  /**
   * The ids on this page, in order. A plain loop rather than a stream chain: this is read by people
   * whose main language may not be Java.
   */
  public List<String> ids() {
    List<String> ids = new java.util.ArrayList<>();
    if (data == null) {
      return ids;
    }
    for (Product product : data) {
      ids.add(product.id());
    }
    return ids;
  }
}
