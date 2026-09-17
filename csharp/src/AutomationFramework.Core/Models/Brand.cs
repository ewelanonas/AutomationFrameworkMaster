using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>
/// A product brand.
/// </summary>
/// <remarks>
/// Wire names are mapped explicitly with <see cref="JsonPropertyNameAttribute"/> rather than by a global
/// naming policy. It is more typing and it means anyone can see what the API actually sends without
/// knowing how the serializer is configured.
/// <para>
/// Unknown properties are ignored by default in System.Text.Json, which is right for workflow models: a
/// field the service adds should not break unrelated tests. Contract tests catch additions on purpose,
/// through JSON Schema with <c>additionalProperties: false</c>.
/// </para>
/// </remarks>
public sealed record Brand(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("slug")] string? Slug);
