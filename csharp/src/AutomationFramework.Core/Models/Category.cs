using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>
/// A product category.
/// </summary>
/// <remarks>
/// <c>ParentId</c> appears only on <c>GET /products/{id}</c>, where categories are expanded with their
/// parent, and is null for a top-level category. The list endpoint omits it entirely.
/// </remarks>
public sealed record Category(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("parent_id")] string? ParentId);
