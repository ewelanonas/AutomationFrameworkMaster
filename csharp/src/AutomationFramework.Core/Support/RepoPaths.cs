namespace AutomationFramework.Core.Support;

/// <summary>
/// Locates repository-level directories so the module behaves the same whether the test host runs
/// from the repository root, from <c>csharp/</c>, or from a build output folder several levels down.
/// </summary>
/// <remarks>
/// Everything is resolved by walking up from the current directory looking for a marker, rather than
/// by hardcoding <c>../../..</c>. A relative path that only works from one launch directory is the
/// most common reason a suite runs in the IDE but not from the command line or in CI.
/// </remarks>
public static class RepoPaths
{
    private const string Marker = "shared/environments";
    private const int MaxLevelsUp = 10;

    /// <summary>The repository root: the nearest ancestor containing <c>shared/environments</c>.</summary>
    public static string RepoRoot()
    {
        string? current = Directory.GetCurrentDirectory();

        for (int level = 0; level <= MaxLevelsUp; level++)
        {
            if (current is null)
            {
                break;
            }

            string candidate = Path.Combine(current, "shared", "environments");
            if (Directory.Exists(candidate))
            {
                return current;
            }

            current = Directory.GetParent(current)?.FullName;
        }

        throw new InvalidOperationException(
            $"Could not locate the repository root. Looked for a '{Marker}' directory in "
            + $"'{Directory.GetCurrentDirectory()}' and up to {MaxLevelsUp} parents. "
            + "Run dotnet from the repository root or from the csharp/ directory.");
    }

    /// <summary>Directory holding the non-secret environment descriptors.</summary>
    public static string Environments() => Path.Combine(RepoRoot(), "shared", "environments");

    /// <summary>Directory holding the JSON Schema contracts.</summary>
    public static string Contracts() => Path.Combine(RepoRoot(), "shared", "contracts");

    /// <summary>Directory for this run's reports and failure artifacts.</summary>
    public static string Reports() => Path.Combine(RepoRoot(), "csharp", "TestResults");
}
