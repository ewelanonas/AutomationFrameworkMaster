using System.Text.RegularExpressions;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Single place every log line and report attachment passes through before it is written.
/// </summary>
/// <remarks>
/// This exists because a trace, an Allure attachment, and a CI log all outlive the run and are
/// readable by more people than the test author expects. A token that reaches any of them cannot be
/// un-leaked.
/// <para>
/// Redaction replaces with a fixed marker. It never partially reveals a value and never reports its
/// length, because both leak information about the secret.
/// </para>
/// </remarks>
public static partial class Redaction
{
    public const string Marker = "***REDACTED***";

    /// <summary>Header names redacted regardless of value.</summary>
    private static readonly string[] SensitiveHeaders =
    [
        "authorization",
        "cookie",
        "set-cookie",
        "proxy-authorization",
        "x-api-key",
    ];

    /// <summary>JSON field names redacted regardless of value.</summary>
    private static readonly string[] SensitiveFields =
    [
        "password",
        "passwd",
        "current_password",
        "new_password",
        "password_confirmation",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "secret",
        "client_secret",
        "api_key",
        "apikey",
        "authorization",
        "ssn",
        "card",
        "card_number",
        "cvv",
        "pin",
    ];

    /// <summary>True when a header of this name must never have its value written out.</summary>
    public static bool IsSensitiveHeader(string? headerName)
    {
        if (string.IsNullOrEmpty(headerName))
        {
            return false;
        }

        foreach (string sensitive in SensitiveHeaders)
        {
            if (string.Equals(headerName, sensitive, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Redacts a header value, returning the marker when the name is sensitive.</summary>
    public static string? Header(string headerName, string? value)
        => IsSensitiveHeader(headerName) ? Marker : Text(value);

    /// <summary>
    /// Redacts a body or free-text blob: sensitive JSON fields by name, then token shapes by pattern.
    /// Both passes run, because a token can arrive either as a named field or embedded in a URL.
    /// </summary>
    public static string? Body(string? content)
        => string.IsNullOrEmpty(content) ? content : Text(RedactJsonFields(content));

    /// <summary>Redacts token-shaped and card-shaped substrings in any text.</summary>
    public static string? Text(string? content)
    {
        if (string.IsNullOrEmpty(content))
        {
            return content;
        }

        string result = JwtPattern().Replace(content, Marker);
        result = BearerPattern().Replace(result, $"$1{Marker}");
        result = CardLikePattern().Replace(result, Marker);
        return result;
    }

    private static string RedactJsonFields(string content)
    {
        return JsonFieldPattern().Replace(
            content,
            match =>
            {
                string key = match.Groups["key"].Value;
                if (IsSensitiveField(key))
                {
                    return match.Groups[1].Value + "\"" + Marker + "\"";
                }

                return match.Value;
            });
    }

    private static bool IsSensitiveField(string fieldName)
    {
        foreach (string sensitive in SensitiveFields)
        {
            if (string.Equals(fieldName, sensitive, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary><c>"field": "value"</c> or <c>"field": 123</c> in a JSON body.</summary>
    [GeneratedRegex("(\"(?<key>[A-Za-z0-9_\\-]+)\"\\s*:\\s*)(\"[^\"]*\"|[^,}\\s]+)")]
    private static partial Regex JsonFieldPattern();

    /// <summary>A JWT anywhere in free text, including inside a URL query string.</summary>
    [GeneratedRegex("eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}")]
    private static partial Regex JwtPattern();

    /// <summary><c>Bearer &lt;token&gt;</c> in free text.</summary>
    [GeneratedRegex("(?i)(bearer\\s+)([A-Za-z0-9._\\-]{8,})")]
    private static partial Regex BearerPattern();

    /// <summary>A run of 13 to 19 digits, the shape of a payment card number.</summary>
    [GeneratedRegex("\\b\\d{13,19}\\b")]
    private static partial Regex CardLikePattern();
}
