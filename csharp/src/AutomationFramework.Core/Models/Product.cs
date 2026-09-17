using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>
/// A product in the catalogue.
/// </summary>
/// <remarks>
/// <c>Price</c> is a <see cref="decimal"/>, not a <c>double</c>. Money in binary floating point produces
/// assertions that fail by a cent for no visible reason, and there is no upside to it here.
/// <para>
/// <c>Specs</c> is populated only by <c>GET /products/{id}</c>; the list endpoint omits it.
/// </para>
/// </remarks>
public sealed record Product(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("price")] decimal Price,
    [property: JsonPropertyName("in_stock")] bool? InStock,
    [property: JsonPropertyName("is_location_offer")] bool? IsLocationOffer,
    [property: JsonPropertyName("is_rental")] bool? IsRental,
    [property: JsonPropertyName("is_eco_friendly")] bool? IsEcoFriendly,
    [property: JsonPropertyName("co2_rating")] string? Co2Rating,
    [property: JsonPropertyName("category")] Category? Category,
    [property: JsonPropertyName("brand")] Brand? Brand,
    [property: JsonPropertyName("product_image")] ProductImage? ProductImage,
    [property: JsonPropertyName("specs")] IReadOnlyList<ProductSpec>? Specs);
