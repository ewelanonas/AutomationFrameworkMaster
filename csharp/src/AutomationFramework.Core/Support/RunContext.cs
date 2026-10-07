using System.Globalization;
using System.Text;

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
/// <para>
/// The run id is deliberately shared between processes that belong to one pipeline run, so
/// <see cref="ProcessTag"/> is what keeps a generated identity unique per process.
/// </para>
/// </remarks>
public static class RunContext
{
    private static readonly string RunIdValue = ResolveRunId();
    private static readonly string ProcessTagValue = BuildProcessTag();
    private static int _sequence;

    /// <summary>Short, lowercase, filename-safe identifier for this run.</summary>
    public static string RunId => RunIdValue;

    /// <summary>
    /// Discriminator for this process, minted once. Makes generated identities unique between two
    /// processes that share a run id.
    /// </summary>
    /// <remarks>
    /// The run id is deliberately shared: it comes from <c>GITHUB_RUN_ID</c> so a generated record can be
    /// traced back to the pipeline run that created it. That sharing is also what broke the suite — the
    /// Java and C# jobs of one workflow run resolved the same run id, restarted their own counters at 1,
    /// and the second job re-registered the first job's email addresses, so the API answered <c>409</c>.
    /// This tag is what makes the identity unique per process while the run id stays traceable.
    /// </remarks>
    public static string ProcessTag => ProcessTagValue;

    /// <summary>
    /// Next correlation id for an outbound request, formatted <c>af-{runId}-{processTag}-{n}</c> so a
    /// server-side log search on the run id returns every request the suite made.
    /// </summary>
    public static string NextCorrelationId()
    {
        int next = Interlocked.Increment(ref _sequence);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"af-{RunIdValue}-{ProcessTagValue}-{next}");
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

        return ShortRandomHex();
    }

    /// <summary>
    /// Builds this process's tag: the CI per-job key and attempt number when present, followed by random
    /// hex; random hex alone otherwise.
    /// </summary>
    /// <remarks>
    /// Random alone is only probabilistically unique. Where the CI provider hands us a key that is unique
    /// by construction within one run — the job key, plus the attempt number, which is what distinguishes
    /// a re-run since <c>GITHUB_RUN_ID</c> is preserved across attempts — that key is folded in, so the
    /// two processes that actually collided cannot collide again. The random part is always present: it
    /// is what separates two local processes, two test hosts inside one job, and two legs of a matrix
    /// job, since the job key does not include matrix values. The job key is truncated to 12 characters,
    /// so the construction-level guarantee covers job keys that differ within those 12 characters and the
    /// random part separates them beyond that.
    /// </remarks>
    private static string BuildProcessTag()
    {
        string random = ShortRandomHex();

        string? job = Environment.GetEnvironmentVariable("GITHUB_JOB");
        string jobPart = SafeTagPart(job, maxLength: 12);
        if (jobPart.Length == 0)
        {
            return random;
        }

        string? attempt = Environment.GetEnvironmentVariable("GITHUB_RUN_ATTEMPT");
        string attemptPart = SafeTagPart(attempt, maxLength: 2);
        if (attemptPart.Length == 0)
        {
            attemptPart = "1";
        }

        return jobPart + "-" + attemptPart + "-" + random;
    }

    /// <summary>Lowercase letters and digits only, so a tag is safe in an email local part and a path.</summary>
    private static string SafeTagPart(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        StringBuilder safe = new();
        foreach (char character in value.ToLowerInvariant())
        {
            if (safe.Length == maxLength)
            {
                break;
            }

            if (char.IsLetterOrDigit(character))
            {
                safe.Append(character);
            }
        }

        return safe.ToString();
    }

    private static string ShortRandomHex()
    {
        return Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture)[..8];
    }
}
