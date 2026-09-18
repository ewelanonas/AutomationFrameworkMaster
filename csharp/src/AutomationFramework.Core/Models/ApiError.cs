using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Models;

/// <summary>
/// An error body.
/// </summary>
/// <remarks>
/// The demo API is inconsistent: some endpoints return <c>{"message": "..."}</c> and others
/// <c>{"error": "..."}</c>. Both are modelled, and <see cref="Text"/> returns whichever is present.
/// <para>
/// This is modelled as-is rather than normalised behind a single field, because a test asserting on a
/// tidied-up view would hide the inconsistency instead of documenting it. The inconsistency is a
/// finding worth raising with the API owners.
/// </para>
/// </remarks>
public sealed record ApiError(
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("error")] string? Error)
{
    /// <summary>The human-readable text, whichever field carried it. Null when neither is present.</summary>
    public string? Text()
    {
        if (!string.IsNullOrWhiteSpace(Message))
        {
            return Message;
        }

        if (!string.IsNullOrWhiteSpace(Error))
        {
            return Error;
        }

        return null;
    }
}
