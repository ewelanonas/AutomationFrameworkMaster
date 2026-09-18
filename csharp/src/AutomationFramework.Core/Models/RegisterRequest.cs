using System.Text.Json.Serialization;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Models;

/// <summary>
/// Payload for <c>POST /users/register</c>.
/// </summary>
/// <remarks>
/// <c>ToString</c> is overridden because this record carries a password.
/// </remarks>
public sealed record RegisterRequest(
    [property: JsonPropertyName("first_name")] string FirstName,
    [property: JsonPropertyName("last_name")] string LastName,
    [property: JsonPropertyName("address")] PostalAddress Address,
    [property: JsonPropertyName("phone")] string Phone,
    [property: JsonPropertyName("dob")] string DateOfBirth,
    [property: JsonPropertyName("email")] string Email,
    [property: JsonPropertyName("password")] string Password)
{
    public override string ToString()
        => $"RegisterRequest {{ Email = {Email}, Password = {Redaction.Marker} }}";
}

/// <summary>A postal address, as the registration endpoint expects it.</summary>
public sealed record PostalAddress(
    [property: JsonPropertyName("street")] string Street,
    [property: JsonPropertyName("city")] string City,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("country")] string Country,
    [property: JsonPropertyName("postal_code")] string PostalCode);
