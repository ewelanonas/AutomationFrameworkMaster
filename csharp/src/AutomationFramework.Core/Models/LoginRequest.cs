using System.Text.Json.Serialization;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Models;

/// <summary>
/// Credentials for <c>POST /users/login</c>.
/// </summary>
/// <remarks>
/// Nulls are omitted by the shared serializer options, which is what lets a negative test send
/// <c>{"email": "..."}</c> with no password key at all rather than an explicit null. Those are different
/// requests and APIs frequently treat them differently.
/// <para>
/// <c>ToString</c> is overridden because a record's generated one prints every property, and this record
/// holds a password. A model that leaks its own secret into a log line or an assertion message defeats
/// the redaction layer from the inside.
/// </para>
/// </remarks>
public sealed record LoginRequest(
    [property: JsonPropertyName("email")] string Email,
    [property: JsonPropertyName("password")] string? Password)
{
    public static LoginRequest Of(string email, string password) => new(email, password);

    /// <summary>A request with no password key at all, for the missing-required-field case.</summary>
    public static LoginRequest WithoutPassword(string email) => new(email, null);

    public override string ToString() => $"LoginRequest {{ Email = {Email}, Password = {Redaction.Marker} }}";
}
