namespace AutomationFramework.Core.Support;

/// <summary>
/// Separates browser console errors worth failing a test for from known, accepted noise.
/// </summary>
/// <remarks>
/// A page that renders correctly while throwing in the console is a real defect that functional
/// assertions never notice, so the check is worth having. But a blanket "no console errors" assertion
/// against an application with third-party scripts fails constantly and gets deleted within a week.
/// <para>
/// The middle ground is a reviewed allowlist. Every entry needs a reason. An entry with no reason is how
/// a real defect gets silently accepted, so the reason is not decoration.
/// </para>
/// </remarks>
public static class ConsoleErrorPolicy
{
    /// <summary>
    /// Known noise on the demo target, each with the reason it is tolerated.
    /// <list type="bullet">
    ///   <item>
    ///     <c>status of 401</c> — the browser's own message for the failed request. The catalogue page
    ///     fires an authenticated call while signed out, on every anonymous page load. It is the
    ///     application's own behaviour, not something the suite introduced, and the page still renders.
    ///   </item>
    ///   <item>
    ///     <c>error {message: unauthorized}</c> — the application's own handler logging that same 401.
    ///     Matched as the exact observed string rather than on the word "unauthorized" alone, so a
    ///     genuine authorization defect logged in different words is still reported. Server-side
    ///     authorization is covered directly by the API tests, which assert 401 and 403 themselves.
    ///   </item>
    ///   <item><c>favicon</c> — a missing icon is not a functional failure.</item>
    ///   <item>
    ///     <c>ERR_BLOCKED_BY_CLIENT</c> — a local ad or tracker blocker cancelling a third-party
    ///     request. Depends on the developer's browser profile, not on the application.
    ///   </item>
    /// </list>
    /// When an entry here starts hiding something real, delete it and fix the cause. Do not add an entry
    /// to make a red test green without understanding what produced it.
    /// </summary>
    private static readonly string[] AcceptedNoise =
    [
        "status of 401",
        "error {message: unauthorized}",
        "favicon",
        "err_blocked_by_client",
        "net::err_blocked",
        "third-party cookie",
    ];

    /// <summary>
    /// Returns only the console errors that should fail a test.
    /// </summary>
    /// <remarks>
    /// A plain loop with an early <c>continue</c> rather than a LINQ chain: the reader may not be a C#
    /// specialist, and this is the method they will be reading when a test fails on console noise.
    /// </remarks>
    public static List<string> Significant(IReadOnlyList<string> allErrors)
    {
        List<string> significant = [];

        foreach (string error in allErrors)
        {
            if (IsAcceptedNoise(error))
            {
                continue;
            }

            significant.Add(error);
        }

        return significant;
    }

    private static bool IsAcceptedNoise(string? error)
    {
        if (string.IsNullOrWhiteSpace(error))
        {
            return true;
        }

        foreach (string accepted in AcceptedNoise)
        {
            if (error.Contains(accepted, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
