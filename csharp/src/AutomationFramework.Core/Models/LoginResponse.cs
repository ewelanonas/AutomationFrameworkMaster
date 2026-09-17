using System.Text.Json.Serialization;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Models;

/// <summary>
/// A successful login.
/// </summary>
/// <remarks>
/// <c>ToString</c> is overridden so the token cannot reach a log line or an assertion failure message
/// through the record's generated implementation.
/// </remarks>
public sealed record LoginResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_in")] int? ExpiresIn)
{
    /// <summary>The value for an <c>Authorization</c> header.</summary>
    public string BearerHeaderValue() => "Bearer " + AccessToken;

    public override string ToString()
        => $"LoginResponse {{ AccessToken = {Redaction.Marker}, TokenType = {TokenType}, "
            + $"ExpiresIn = {ExpiresIn} }}";
}
