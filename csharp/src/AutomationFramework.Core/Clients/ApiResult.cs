using System.Text.Json;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Clients;

/// <summary>
/// The outcome of one API call: status, deserialized body, and the raw response text.
/// </summary>
/// <remarks>
/// This type exists so clients never throw on a non-2xx status. A 403 test and a 200 test then read
/// identically, and neither needs a try/catch. A client that throws on error statuses forces every
/// negative test into exception handling, which hides what is actually being asserted.
/// <para>
/// The body is only deserialized on success. Parsing an error body as the success type would fail for the
/// wrong reason and bury the real status code.
/// </para>
/// <para>
/// The response text is captured eagerly rather than kept as a stream, because an
/// <c>HttpResponseMessage</c> content stream can only be read once, and both the report attachment and
/// the schema validator need it.
/// </para>
/// </remarks>
/// <typeparam name="T">The success body type.</typeparam>
public sealed record ApiResult<T>(int Status, T? Body, string RawBody, ResponseHeaders Headers)
{
    public bool IsSuccessful => Status is >= 200 and < 300;

    /// <summary>The error body. Only meaningful for a failed call.</summary>
    public ApiError Error()
    {
        if (string.IsNullOrWhiteSpace(RawBody))
        {
            return new ApiError(null, null);
        }

        ApiError? parsed = JsonSerializer.Deserialize<ApiError>(RawBody, ApiHttp.JsonOptions);
        return parsed ?? new ApiError(null, null);
    }
}

/// <summary>Factory helpers for <see cref="ApiResult{T}"/>.</summary>
public static class ApiResult
{
    /// <summary>Wraps a response, deserializing the body only when the status indicates success.</summary>
    public static async Task<ApiResult<T>> OfAsync<T>(HttpResponseMessage response)
    {
        int status = (int)response.StatusCode;
        string rawBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

        T? body = default;
        if (status is >= 200 and < 300 && !string.IsNullOrWhiteSpace(rawBody))
        {
            body = JsonSerializer.Deserialize<T>(rawBody, ApiHttp.JsonOptions);
        }

        return new ApiResult<T>(status, body, rawBody, new ResponseHeaders(response));
    }

    /// <summary>Wraps a response with no body worth deserializing, such as a 204 or a status probe.</summary>
    public static async Task<ApiResult<NoBody>> OfStatusOnlyAsync(HttpResponseMessage response)
    {
        string rawBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        return new ApiResult<NoBody>(
            (int)response.StatusCode, null, rawBody, new ResponseHeaders(response));
    }
}

/// <summary>
/// Stand-in for "this call has no body worth deserializing".
/// </summary>
/// <remarks>
/// C# has no <c>void</c> type argument, and using <c>object</c> would imply a body exists.
/// </remarks>
public sealed record NoBody;

/// <summary>
/// A snapshot of response headers, including content headers.
/// </summary>
/// <remarks>
/// Copied out of the <c>HttpResponseMessage</c> so an <see cref="ApiResult{T}"/> can outlive the disposal
/// of the response, which the client methods do with a <c>using</c>.
/// </remarks>
public sealed class ResponseHeaders
{
    private readonly Dictionary<string, string> _values = new(StringComparer.OrdinalIgnoreCase);

    internal ResponseHeaders(HttpResponseMessage response)
    {
        foreach (KeyValuePair<string, IEnumerable<string>> header in response.Headers)
        {
            _values[header.Key] = string.Join(", ", header.Value);
        }

        foreach (KeyValuePair<string, IEnumerable<string>> header in response.Content.Headers)
        {
            _values[header.Key] = string.Join(", ", header.Value);
        }
    }

    /// <summary>A header value, or null when the header is absent.</summary>
    public string? Value(string name)
        => _values.TryGetValue(name, out string? value) ? value : null;

    /// <summary>True when the header is present.</summary>
    public bool Has(string name) => _values.ContainsKey(name);
}
