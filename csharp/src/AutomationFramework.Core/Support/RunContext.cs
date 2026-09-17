using System.Globalization;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Identity for a single execution of the suite.
/// </summary>
/// <remarks>
/// The run id ties together every generated value, every log line, and every correlation header from
/// one run. When a test fails in CI and leaves data behind, the run id is what lets you find both the
/// log and the orphaned record.
/// <para>
/// Set <c>AF_RUN_ID</c> to reuse an id, which is useful when re-running a single test against data an
/// earlier run created.
/// </para>
/// </remarks>
public static class RunContext
{
    private static readonly string RunIdValue = ResolveRunId();
    private static int _sequence;

    /// <summary>Short, lowercase, filename-safe identifier for this run.</summary>
    public static string RunId => RunIdValue;

    /// <summary>
    /// Next correlation id for an outbound request, formatted <c>af-{runId}-{n}</c> so a server-side
    /// log search on the run id returns every request the suite made.
    /// </summary>
    public static string NextCorrelationId()
    {
        int next = Interlocked.Increment(ref _sequence);
        return string.Create(CultureInfo.InvariantCulture, $"af-{RunIdValue}-{next}");
    }

    /// <summary>Next value in the run-scoped sequence. Used by builders to keep generated data unique.</summary>
    public static int NextSequence() => Interlocked.Increment(ref _sequence);

    private static string ResolveRunId()
    {
        string? fromEnvironment = Environment.GetEnvironmentVariable("AF_RUN_ID");
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment.Trim();
        }

        // A CI build number makes a run traceable back to the pipeline that produced it.
        string? ciRun = Environment.GetEnvironmentVariable("GITHUB_RUN_ID");
        if (!string.IsNullOrWhiteSpace(ciRun))
        {
            return ciRun.Trim();
        }

        return Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture)[..8];
    }
}
