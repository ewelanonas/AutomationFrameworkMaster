using System.Globalization;
using System.Text;
using Allure.Net.Commons;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Flows;
using AutomationFramework.Core.Support;
using Microsoft.Playwright;
using NUnit.Framework;
using NUnit.Framework.Interfaces;

namespace AutomationFramework.Tests;

/// <summary>
/// One thin base class for UI tests: a fresh isolated context per test, and failure artifacts.
/// </summary>
/// <remarks>
/// NUnit makes this simpler than the JUnit equivalent in the Java module. The test outcome is already
/// available on <c>TestContext.CurrentContext.Result</c> inside <c>[TearDown]</c>, so the page is still
/// open when the failure is known and a screenshot of the actual failure needs no extra machinery.
/// <para>
/// API clients are available to UI tests deliberately: preconditions are seeded over the API, never built
/// by clicking through the interface.
/// </para>
/// </remarks>
public abstract class UiTestBase
{
    private readonly List<string> _consoleErrors = [];
    private IBrowserContext? _context;
    private IPage? _page;

    protected AppConfig Config { get; } = ConfigLoader.Config;

    protected ProductsClient Products { get; } = new(ApiHttp.Client);

    protected AuthClient Auth { get; } = new(ApiHttp.Client);

    protected AuthFlow AuthFlow { get; } = new(new AuthClient(ApiHttp.Client));

    /// <summary>
    /// Registers disposable accounts. Any test that signs in uses one of these rather than a shared account.
    /// </summary>
    protected AccountFlow Accounts { get; } = new(new UsersClient(ApiHttp.Client));

    /// <summary>The page for this test.</summary>
    protected IPage Page => _page
        ?? throw new InvalidOperationException("No page for this test. Did SetUp run?");

    /// <summary>The isolated browser context for this test, for storage state and cookie work.</summary>
    protected IBrowserContext BrowserContext => _context
        ?? throw new InvalidOperationException("No browser context for this test. Did SetUp run?");

    /// <summary>Every browser console error recorded during this test, unfiltered. For diagnostics.</summary>
    protected IReadOnlyList<string> ConsoleErrors => _consoleErrors;

    /// <summary>
    /// Console errors worth failing a test for, with known third-party and application noise filtered out
    /// by <see cref="ConsoleErrorPolicy"/>.
    /// </summary>
    /// <remarks>
    /// This is the accessor tests should use. A blanket assertion of zero console errors against a real
    /// application fails constantly and gets deleted within a week.
    /// </remarks>
    protected List<string> SignificantConsoleErrors() => ConsoleErrorPolicy.Significant(_consoleErrors);

    [SetUp]
    public async Task CreateContextAndPage()
    {
        TestLog.BeginScope(TestContext.CurrentContext.Test.Name);

        _consoleErrors.Clear();
        _context = await PlaywrightFactory.NewContextAsync().ConfigureAwait(false);
        _page = await _context.NewPageAsync().ConfigureAwait(false);

        _page.Console += (_, message) =>
        {
            if (string.Equals(message.Type, "error", StringComparison.Ordinal))
            {
                _consoleErrors.Add(message.Text);
            }
        };

        _page.PageError += (_, error) => _consoleErrors.Add(error);
    }

    [TearDown]
    public async Task CaptureArtifactsAndCloseContext()
    {
        bool failed = TestContext.CurrentContext.Result.Outcome.Status == TestStatus.Failed;

        try
        {
            if (failed && _page is not null)
            {
                await AttachScreenshotAsync(_page).ConfigureAwait(false);
                await AttachPageHtmlAsync(_page).ConfigureAwait(false);
                await AttachDiagnosticsAsync(_page).ConfigureAwait(false);
            }

            if (_context is not null)
            {
                string? tracePath = failed ? ArtifactPath("trace.zip") : null;
                await PlaywrightFactory.StopTracingAsync(_context, tracePath).ConfigureAwait(false);

                if (tracePath is not null)
                {
                    await AttachFileAsync("Playwright trace", tracePath, "application/zip")
                        .ConfigureAwait(false);
                    TestLog.Info(
                        $"Trace written to {tracePath}. Open it with: npx playwright show-trace {tracePath}");
                }
            }
        }
        finally
        {
            if (_context is not null)
            {
                await _context.CloseAsync().ConfigureAwait(false);
            }

            _context = null;
            _page = null;
            TestLog.EndScope();
        }
    }

    /// <summary>
    /// Runs an artifact capture, swallowing anything it throws.
    /// </summary>
    /// <remarks>
    /// This is the one place a broad catch is right, and it is here because of a real failure. When the
    /// browser had already closed, <c>AllureApi.AddAttachment</c> threw a <see cref="NullReferenceException"/>
    /// from the teardown, and NUnit reported <i>that</i> alongside the real assertion failure. The diagnostic
    /// path had become the headline.
    /// <para>
    /// A capture that fails must degrade to a warning, never replace the failure it was trying to explain.
    /// Each capture is also isolated from the others: if the browser died, the screenshot will fail while the
    /// diagnostics text still succeeds, and losing one artifact must not cost the rest.
    /// </para>
    /// </remarks>
    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Design",
        "CA1031:Do not catch general exception types",
        Justification = "A failure-artifact capture must never mask the test failure it is documenting.")]
    private static async Task TryCaptureAsync(string what, Func<Task> capture)
    {
        try
        {
            await capture().ConfigureAwait(false);
        }
        catch (Exception e)
        {
            TestLog.Warn($"Could not capture {what}: {e.GetType().Name}: {e.Message}");
        }
    }

    private static Task AttachScreenshotAsync(IPage page)
        => TryCaptureAsync("a screenshot", async () =>
        {
            byte[] png = await page.ScreenshotAsync(new PageScreenshotOptions
            {
                FullPage = true,
                Type = ScreenshotType.Png,
            }).ConfigureAwait(false);

            AllureApi.AddAttachment("Screenshot at failure", "image/png", png, ".png");
        });

    private static Task AttachPageHtmlAsync(IPage page)
        => TryCaptureAsync("page HTML", async () =>
        {
            string html = await page.ContentAsync().ConfigureAwait(false);
            AllureApi.AddAttachment(
                "Page HTML at failure", "text/html", Encoding.UTF8.GetBytes(html), ".html");
        });

    private Task AttachDiagnosticsAsync(IPage page)
        => TryCaptureAsync("failure diagnostics", async () =>
        {
            StringBuilder report = new();
            report.Append("test: ").AppendLine(TestContext.CurrentContext.Test.FullName);
            report.Append("runId: ").AppendLine(RunContext.RunId);

            try
            {
                report.Append("url: ").AppendLine(page.Url);
                report.Append("title: ").AppendLine(await page.TitleAsync().ConfigureAwait(false));
            }
            catch (PlaywrightException e)
            {
                // Expected when the page has already closed. The rest of the report is still worth having,
                // which is why this is caught here rather than abandoning the whole attachment.
                report.Append("url/title unavailable: ").AppendLine(e.Message);
            }

            report.Append("browser console errors: ")
                .AppendLine(_consoleErrors.Count.ToString(CultureInfo.InvariantCulture));

            foreach (string error in _consoleErrors)
            {
                report.Append("  - ").AppendLine(error);
            }

            AllureApi.AddAttachment(
                "Failure diagnostics", "text/plain", Encoding.UTF8.GetBytes(report.ToString()), ".txt");
        });

    private static Task AttachFileAsync(string name, string path, string contentType)
        => TryCaptureAsync(name, async () =>
        {
            byte[] bytes = await File.ReadAllBytesAsync(path).ConfigureAwait(false);
            AllureApi.AddAttachment(name, contentType, bytes, Path.GetExtension(path));
        });

    private static string ArtifactPath(string fileName)
    {
        string safeName = SafeFileName(TestContext.CurrentContext.Test.Name);

        string directory = Path.Combine(
            RepoPaths.Reports(), "failure-artifacts", RunContext.RunId, safeName);

        Directory.CreateDirectory(directory);
        return Path.Combine(directory, fileName);
    }

    private static string SafeFileName(string testName)
    {
        StringBuilder safe = new();

        foreach (char character in testName.ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                safe.Append(character);
            }
            else if (safe.Length > 0 && safe[^1] != '-')
            {
                safe.Append('-');
            }
        }

        return safe.ToString().Trim('-');
    }
}
