using System.Globalization;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Structured logging for the suite, with per-test attribution.
/// </summary>
/// <remarks>
/// With parallel execution, lines from several tests interleave into one stream. Without a per-test
/// marker on every line that stream is unreadable exactly when it matters, which is why every line
/// carries the run id and the current test name.
/// <para>
/// The output sink is replaceable rather than hardcoded to <c>Console</c>. The test assembly points it
/// at NUnit's <c>TestContext.Progress</c>, which attributes output to the right test and keeps it out
/// of the shared standard-output stream. Core stays free of a test-framework dependency, and no
/// production-style logging package is needed for what is a handful of lines.
/// </para>
/// </remarks>
public static class TestLog
{
    private static readonly AsyncLocal<string?> CurrentTest = new();
    private static Action<string> _sink = Console.WriteLine;

    /// <summary>Points log output at a different sink, such as NUnit's per-test progress writer.</summary>
    public static void UseSink(Action<string> sink) => _sink = sink;

    /// <summary>
    /// Associates subsequent log lines on this async flow with a test name. The equivalent of MDC in
    /// the Java module, using <see cref="AsyncLocal{T}"/> so it follows <c>await</c> boundaries.
    /// </summary>
    public static void BeginScope(string testName) => CurrentTest.Value = testName;

    /// <summary>Clears the test scope. A leaked value gets attributed to whichever test runs next.</summary>
    public static void EndScope() => CurrentTest.Value = null;

    public static void Info(string message) => Write("INFO ", message);

    public static void Warn(string message) => Write("WARN ", message);

    public static void Debug(string message) => Write("DEBUG", message);

    private static void Write(string level, string message)
    {
        string timestamp = DateTime.UtcNow.ToString("HH:mm:ss.fff", CultureInfo.InvariantCulture);
        string test = CurrentTest.Value ?? "setup";

        // Redacted on the way out, not at every call site. A single choke point is the only way to be
        // confident nothing slips through.
        string safe = Redaction.Text(message) ?? string.Empty;

        _sink($"{timestamp} {level} [{RunContext.RunId}] [{test}] {safe}");
    }
}
