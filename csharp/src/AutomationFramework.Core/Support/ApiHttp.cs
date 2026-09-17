using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AutomationFramework.Core.Support;

/// <summary>
/// The one <see cref="HttpClient"/> the suite uses, and the shared JSON options.
/// </summary>
/// <remarks>
/// One client for the whole run, not one per call. A new <see cref="HttpClient"/> per request exhausts
/// sockets under load and is the textbook .NET mistake; a shared instance also guarantees every call
/// goes through <see cref="RedactingHttpHandler"/> and carries the configured timeout.
/// <para>
/// <c>IHttpClientFactory</c> would be the production answer, but it exists to manage handler lifetimes
/// and DNS rotation for a long-running service. A test run is short-lived and has no DI container, so
/// it would add a dependency and a service collection to solve a problem this process does not have.
/// </para>
/// </remarks>
public static class ApiHttp
{
    private static readonly object Gate = new();
    private static HttpClient? _client;

    /// <summary>
    /// Serializer options shared by every client and model.
    /// </summary>
    /// <remarks>
    /// Property names are mapped explicitly with <c>[JsonPropertyName]</c> on each model rather than by
    /// a naming policy. It is more typing, and it means anyone can see what the API actually sends
    /// without knowing how the serializer is configured.
    /// <para>
    /// <c>DefaultIgnoreCondition</c> omits nulls so a negative test can send a payload with a required
    /// field absent entirely, rather than present and null. Those are different requests and APIs
    /// frequently treat them differently.
    /// </para>
    /// </remarks>
    public static JsonSerializerOptions JsonOptions { get; } = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    /// <summary>The shared client, created on first use with the base address and timeout from config.</summary>
    /// <remarks>
    /// CA2000 is suppressed rather than satisfied: the handler's lifetime is owned by the
    /// <see cref="HttpClient"/>, which lives for the whole process. Disposing it here would break every
    /// subsequent request.
    /// </remarks>
    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Reliability",
        "CA2000:Dispose objects before losing scope",
        Justification = "Ownership passes to the HttpClient, which lives for the process lifetime.")]
    public static HttpClient Client
    {
        get
        {
            lock (Gate)
            {
                if (_client is not null)
                {
                    return _client;
                }

                AppConfig config = ConfigLoader.Config;

                _client = new HttpClient(new RedactingHttpHandler())
                {
                    BaseAddress = new Uri(config.Api.BaseUrl + "/"),

                    // An explicit timeout, never infinite. A hung request should fail the test with a
                    // timeout, not stall the run until CI kills the job.
                    Timeout = TimeSpan.FromMilliseconds(config.Timeouts.ApiMs),
                };

                _client.DefaultRequestHeaders.Accept.Add(
                    new MediaTypeWithQualityHeaderValue("application/json"));

                return _client;
            }
        }
    }
}
