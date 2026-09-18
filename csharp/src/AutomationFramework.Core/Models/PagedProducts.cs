using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>
/// The pagination envelope the catalogue returns.
/// </summary>
/// <remarks>
/// <c>From</c> and <c>To</c> are nullable: on an empty result the API sends null for both, which is
/// exactly the case a pagination test needs to cover.
/// </remarks>
public sealed record PagedProducts(
    [property: JsonPropertyName("current_page")] int CurrentPage,
    [property: JsonPropertyName("data")] IReadOnlyList<Product> Data,
    [property: JsonPropertyName("from")] int? From,
    [property: JsonPropertyName("to")] int? To,
    [property: JsonPropertyName("last_page")] int LastPage,
    [property: JsonPropertyName("per_page")] int PerPage,
    [property: JsonPropertyName("total")] int Total)
{
    /// <summary>True when this page carries no items.</summary>
    public bool IsEmpty => Data is null || Data.Count == 0;

    /// <summary>Number of items on this page, 0 when the page is empty.</summary>
    public int Size => Data?.Count ?? 0;

    /// <summary>
    /// The ids on this page, in order.
    /// </summary>
    /// <remarks>
    /// A plain loop rather than a LINQ projection: this is read by people whose main language may not be
    /// C#, and a loop is always understood.
    /// </remarks>
    public List<string> Ids()
    {
        List<string> ids = [];
        if (Data is null)
        {
            return ids;
        }

        foreach (Product product in Data)
        {
            ids.Add(product.Id);
        }

        return ids;
    }
}
