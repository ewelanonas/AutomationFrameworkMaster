package com.company.automation.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

/**
 * A product in the catalogue.
 *
 * <p>{@code price} is a {@link BigDecimal}, not a {@code double}. Money in binary floating point
 * produces assertions that fail by a cent for no visible reason, and there is no upside to it here.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Product(
    @JsonProperty("id") String id,
    @JsonProperty("name") String name,
    @JsonProperty("description") String description,
    @JsonProperty("price") BigDecimal price,
    @JsonProperty("in_stock") Boolean inStock,
    @JsonProperty("is_location_offer") Boolean isLocationOffer,
    @JsonProperty("is_rental") Boolean isRental,
    @JsonProperty("is_eco_friendly") Boolean isEcoFriendly,
    @JsonProperty("co2_rating") String co2Rating,
    @JsonProperty("category") Category category,
    @JsonProperty("brand") Brand brand,
    @JsonProperty("product_image") ProductImage productImage) {}
