using Microsoft.Playwright;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Owns the Playwright lifecycle.
/// </summary>
/// <remarks>
/// Two constraints drive the design:
/// <list type="bullet">
///   <item>
///     <c>Playwright.CreateAsync()</c> starts a Node driver process and costs seconds. Doing it per
///     test would dominate the run, so one <see cref="IPlaywright"/> and one <see cref="IBrowser"/>
///     are shared for the whole assembly.
///   </item>
///   <item>
///     An <see cref="IBrowserContext"/> is cheap and gives complete isolation: separate cookies,
///     storage and cache. That is why each test gets a fresh one. Sharing a page across tests is the
///     cause of the classic "fails only when it runs second" flake.
///   </item>
/// </list>
/// <para>
/// Unlike the Java binding, Playwright for .NET is safe to use from multiple threads against one
/// <see cref="IBrowser"/>, so no thread-local is needed here. The isolation boundary is the context,
/// not the thread.
/// </para>
/// </remarks>
public static class PlaywrightFactory
{
    private static IPlaywright? _playwright;
    private static IBrowser? _browser;

    /// <summary>
    /// Creates the shared Playwright instance and browser. Call exactly once, from assembly-level setup.
    /// </summary>
    /// <remarks>
    /// Eager initialization here rather than lazily on first use, and the reason is not style.
    /// <para>
    /// Creating Playwright lazily inside a test's <c>async Task [SetUp]</c> deadlocks. NUnit runs async
    /// setup through an adapter that blocks the worker thread without pumping a message loop, while
    /// <c>Playwright.CreateAsync()</c> has internal continuations that post back to the captured
    /// <see cref="SynchronizationContext"/>. Those continuations then never run, and the suite hangs with no
    /// output at all — not even a test name, which makes it look like an environment failure rather than a
    /// deadlock.
    /// </para>
    /// <para>
    /// <c>Task.Run</c> is what makes this safe: it detaches the work from any ambient synchronization
    /// context, so every continuation lands on the thread pool. Doing it once, before the parallel workers
    /// start, also means the expensive driver start-up is not raced by four threads.
    /// </para>
    /// </remarks>
    public static async Task InitializeAsync()
    {
        if (_browser is not null)
        {
            return;
        }

        AppConfig config = ConfigLoader.Config;
        BrowserInstaller.EnsureInstalled(config.Execution.Browser);

        (IPlaywright playwright, IBrowser browser) = await Task.Run(async () =>
        {
            IPlaywright created = await Playwright.CreateAsync().ConfigureAwait(false);

            // Applied once. The attribute is per-application, so it comes from config rather than being
            // hardcoded: this repo's demo target uses data-test, not data-testid.
            created.Selectors.SetTestIdAttribute(config.Execution.TestIdAttribute);

            IBrowserType browserType = BrowserTypeFor(created, config.Execution.Browser);

            IBrowser launched = await browserType.LaunchAsync(new BrowserTypeLaunchOptions
            {
                Headless = config.Execution.Headless,

                // Disabling animations removes a whole class of "fails as the modal appears" flake.
                Args = ["--force-prefers-reduced-motion"],
            }).ConfigureAwait(false);

            return (created, launched);
        }).ConfigureAwait(false);

        _playwright = playwright;
        _browser = browser;

        TestLog.Info(
            $"Launched {config.Execution.Browser} (headless={config.Execution.Headless}).");
    }

    /// <summary>The shared browser. <see cref="InitializeAsync"/> must have run first.</summary>
    public static IBrowser Browser => _browser
        ?? throw new InvalidOperationException(
            "The browser has not been created. GlobalSetup.BeforeAllTests must call "
            + "PlaywrightFactory.InitializeAsync() before any UI test runs.");

    /// <summary>
    /// A fresh, isolated context for one test, with tracing already started.
    /// </summary>
    /// <remarks>
    /// Tracing is always started and only ever <i>saved</i> on failure. Starting it conditionally would
    /// mean the first failure is the one run with no trace, which is precisely the run you need.
    /// </remarks>
    public static async Task<IBrowserContext> NewContextAsync()
    {
        AppConfig config = ConfigLoader.Config;

        IBrowserContext context = await Browser.NewContextAsync(new BrowserNewContextOptions
        {
            ViewportSize = new ViewportSize
            {
                Width = config.Ui.ViewportWidth,
                Height = config.Ui.ViewportHeight,
            },
            Locale = config.Ui.Locale,
            TimezoneId = config.Ui.TimezoneId,
            BaseURL = config.Ui.BaseUrl,
        }).ConfigureAwait(false);

        context.SetDefaultTimeout(config.Timeouts.ElementMs);
        context.SetDefaultNavigationTimeout(config.Timeouts.NavigationMs);

        await context.Tracing.StartAsync(new TracingStartOptions
        {
            Screenshots = true,
            Snapshots = true,
            Sources = true,
        }).ConfigureAwait(false);

        return context;
    }

    /// <summary>
    /// Stops tracing, writing the trace file only when <paramref name="tracePath"/> is set.
    /// </summary>
    /// <remarks>
    /// Tolerant of an already-closed context. When a test fails because the browser died, stopping the trace
    /// throws as well — and a teardown that throws replaces the real failure in the report with a confusing
    /// secondary one.
    /// </remarks>
    public static async Task StopTracingAsync(IBrowserContext context, string? tracePath)
    {
        try
        {
            await context.Tracing.StopAsync(new TracingStopOptions { Path = tracePath })
                .ConfigureAwait(false);
        }
        catch (PlaywrightException e)
        {
            TestLog.Warn($"Could not stop tracing: {e.Message}");
        }
    }

    /// <summary>Closes the shared browser. Called once from the assembly-level teardown.</summary>
    public static async Task CloseAsync()
    {
        if (_browser is not null)
        {
            await _browser.CloseAsync().ConfigureAwait(false);
            _browser = null;
        }

        _playwright?.Dispose();
        _playwright = null;
    }

    private static IBrowserType BrowserTypeFor(IPlaywright playwright, string name)
    {
        if (string.Equals(name, "firefox", StringComparison.OrdinalIgnoreCase))
        {
            return playwright.Firefox;
        }

        if (string.Equals(name, "webkit", StringComparison.OrdinalIgnoreCase))
        {
            return playwright.Webkit;
        }

        if (string.Equals(name, "chromium", StringComparison.OrdinalIgnoreCase))
        {
            return playwright.Chromium;
        }

        throw new ArgumentException(
            $"Unsupported browser '{name}'. Use chromium, firefox or webkit.", nameof(name));
    }
}
