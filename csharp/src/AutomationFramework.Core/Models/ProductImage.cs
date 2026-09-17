using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>Image metadata attached to a product, including its attribution.</summary>
public sealed record ProductImage(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("file_name")] string FileName,
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("by_name")] string? ByName,
    [property: JsonPropertyName("by_url")] string? ByUrl,
    [property: JsonPropertyName("source_name")] string? SourceName,
    [property: JsonPropertyName("source_url")] string? SourceUrl);
