using System.Text.Json;
using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>
/// One specification row on a product, for example <c>Weight = 340 g</c>.
/// </summary>
/// <remarks>
/// Returned only by <c>GET /products/{id}</c>; the list endpoint omits the whole array.
/// <para>
/// <c>SpecValue</c> is a <see cref="JsonElement"/> because the API sends it as either a string
/// (<c>"Bi-component"</c>) or a number (<c>200</c>) depending on the row. Modelling it as
/// <c>string</c> would fail to deserialize, and modelling it as <c>object</c> would push the type
/// question onto every caller. <see cref="ValueAsText"/> gives the readable form.
/// </para>
/// </remarks>
public sealed record ProductSpec(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("product_id")] string ProductId,
    [property: JsonPropertyName("spec_name")] string SpecName,
    [property: JsonPropertyName("spec_value")] JsonElement SpecValue,
    [property: JsonPropertyName("spec_unit")] string? SpecUnit)
{
    /// <summary>The value as text, whichever JSON type carried it.</summary>
    public string ValueAsText()
        => SpecValue.ValueKind == JsonValueKind.String
            ? SpecValue.GetString() ?? string.Empty
            : SpecValue.ToString();
}
