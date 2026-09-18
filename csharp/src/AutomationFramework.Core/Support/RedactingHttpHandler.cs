using System.Diagnostics;
using System.Globalization;
using System.Text;
using Allure.Net.Commons;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Adds a correlation id to every request, then logs and attaches the request/response pair with
/// secrets removed first.
/// </summary>
/// <remarks>
/// A <see cref="DelegatingHandler"/> is the right place for this: it sees every call made through the
/// client, so no individual client method can forget to log.
/// <para>
/// Everything passes through <see cref="Redaction"/> before it is written anywhere. A live bearer token
/// in an Allure attachment or a CI log outlives the run and is readable by more people than the test
/// author expects.
/// </para>
/// <para>
/// The attachment is what makes an API failure diagnosable without re-running it: the request that was
/// actually sent, the status that actually came back, and the correlation id to search server logs
/// with.
/// </para>
/// </remarks>
public sealed class RedactingHttpHandler : DelegatingHandler
{
    private const int MaxBodyCharacters = 20_000;

    /// <summary>
    /// Creates the handler over a fresh <see cref="HttpClientHandler"/>.
    /// </summary>
    /// <remarks>
    /// CA2000 is suppressed rather than satisfied. The inner handler is owned by this instance and
    /// disposed by the base class, which in turn is disposed by the <see cref="HttpClient"/> that wraps
    /// it. The analyzer cannot see ownership transfer through a constructor, so the alternative would be a
    /// try/finally that disposes the handler this object needs to keep.
    /// </remarks>
    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Reliability",
        "CA2000:Dispose objects before losing scope",
        Justification = "Ownership passes to the base DelegatingHandler, which disposes it.")]
    public RedactingHttpHandler()
        : base(new HttpClientHandler())
    {
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        string correlationId = RunContext.NextCorrelationId();
        request.Headers.TryAddWithoutValidation("X-Correlation-Id", correlationId);

        string requestReport = await DescribeRequestAsync(request, correlationId).ConfigureAwait(false);

        Stopwatch stopwatch = Stopwatch.StartNew();
        HttpResponseMessage response = await base.SendAsync(request, cancellationToken)
            .ConfigureAwait(false);
        stopwatch.Stop();

        string responseReport = await DescribeResponseAsync(
            response, correlationId, stopwatch.ElapsedMilliseconds).ConfigureAwait(false);

        TestLog.Info(string.Create(
            CultureInfo.InvariantCulture,
            $"{request.Method} {request.RequestUri} -> {(int)response.StatusCode} in {stopwatch.ElapsedMilliseconds}ms [{correlationId}]"));

        AllureApi.AddAttachment($"API request {correlationId}", "text/plain", Encoding.UTF8.GetBytes(requestReport));
        AllureApi.AddAttachment($"API response {correlationId}", "text/plain", Encoding.UTF8.GetBytes(responseReport));

        return response;
    }

    private static async Task<string> DescribeRequestAsync(HttpRequestMessage request, string correlationId)
    {
        StringBuilder report = new();
        report.Append(request.Method).Append(' ').Append(request.RequestUri).AppendLine();
        report.Append("correlationId: ").AppendLine(correlationId);
        report.AppendLine("--- headers ---");

        foreach (KeyValuePair<string, IEnumerable<string>> header in request.Headers)
        {
            report.Append(header.Key).Append(": ")
                .AppendLine(Redaction.Header(header.Key, string.Join(", ", header.Value)));
        }

        if (request.Content is not null)
        {
            foreach (KeyValuePair<string, IEnumerable<string>> header in request.Content.Headers)
            {
                report.Append(header.Key).Append(": ")
                    .AppendLine(Redaction.Header(header.Key, string.Join(", ", header.Value)));
            }

            string body = await request.Content.ReadAsStringAsync().ConfigureAwait(false);
            report.AppendLine("--- body ---").AppendLine(Redaction.Body(Truncate(body)));
        }

        return report.ToString();
    }

    private static async Task<string> DescribeResponseAsync(
        HttpResponseMessage response,
        string correlationId,
        long elapsedMs)
    {
        StringBuilder report = new();
        report.Append("status: ").Append((int)response.StatusCode).Append(' ')
            .AppendLine(response.StatusCode.ToString());
        report.Append("elapsedMs: ").AppendLine(elapsedMs.ToString(CultureInfo.InvariantCulture));
        report.Append("correlationId: ").AppendLine(correlationId);
        report.AppendLine("--- headers ---");

        foreach (KeyValuePair<string, IEnumerable<string>> header in response.Headers)
        {
            report.Append(header.Key).Append(": ")
                .AppendLine(Redaction.Header(header.Key, string.Join(", ", header.Value)));
        }

        // A response body can legitimately be empty (204) or non-text. Neither should turn a real
        // assertion failure into a confusing handler failure.
        string body;
        try
        {
            body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        }
        catch (HttpRequestException e)
        {
            body = $"<body could not be read: {e.GetType().Name}>";
        }

        report.AppendLine("--- body ---").AppendLine(Redaction.Body(Truncate(body)));
        return report.ToString();
    }

    private static string Truncate(string? body)
    {
        if (string.IsNullOrEmpty(body))
        {
            return string.Empty;
        }

        return body.Length <= MaxBodyCharacters
            ? body
            : body[..MaxBodyCharacters] + "\n... truncated for the report ...";
    }
}
