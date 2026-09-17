namespace AutomationFramework.Core.Support;

/// <summary>
/// Installs Playwright's browser binaries from inside the process.
/// </summary>
/// <remarks>
/// Playwright for .NET, unlike the Java and Python bindings, does <b>not</b> download browsers on
/// first use. The documented route is <c>pwsh playwright.ps1 install</c>, which requires PowerShell 7
/// to be installed separately. It is not present on every developer machine, and a framework whose
/// first run fails on a missing shell is a framework nobody adopts.
/// <para>
/// <c>Microsoft.Playwright.Program.Main</c> is the same entry point that script calls, so invoking it
/// directly removes the external dependency entirely. Installing when the browser is already present
/// is a fast no-op, which is why this can run unconditionally at start-up.
/// </para>
/// <para>
/// Set <c>AF_SKIP_BROWSER_INSTALL=true</c> in CI, where the browser is pre-installed and cached, to
/// skip the check. Installing there is not wrong, just wasted time.
/// </para>
/// </remarks>
public static class BrowserInstaller
{
    private static readonly object Gate = new();
    private static bool _done;

    /// <summary>Ensures the configured browser is installed. Safe and cheap to call more than once.</summary>
    public static void EnsureInstalled(string browser)
    {
        lock (Gate)
        {
            if (_done)
            {
                return;
            }

            if (ShouldSkip())
            {
                TestLog.Info("Skipping the browser install check (AF_SKIP_BROWSER_INSTALL is set).");
                _done = true;
                return;
            }

            TestLog.Info($"Ensuring the {browser} browser is installed. First run downloads it.");

            int exitCode = Microsoft.Playwright.Program.Main(["install", browser]);
            if (exitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Playwright could not install '{browser}' (exit code {exitCode}). "
                    + "Check network access to the Playwright CDN, or install it manually with "
                    + "'pwsh csharp/tests/AutomationFramework.Tests/bin/Debug/net8.0/playwright.ps1 install'.");
            }

            _done = true;
        }
    }

    private static bool ShouldSkip()
    {
        string? flag = Environment.GetEnvironmentVariable("AF_SKIP_BROWSER_INSTALL");
        return !string.IsNullOrWhiteSpace(flag) && bool.TryParse(flag, out bool parsed) && parsed;
    }
}
