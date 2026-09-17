using AutomationFramework.Core.Support;
using Microsoft.Playwright;
using NUnit.Framework;

namespace AutomationFramework.Tests;

/// <summary>
/// Suite-level setup and teardown.
/// </summary>
/// <remarks>
/// A <see cref="SetUpFixtureAttribute"/> applies to its own namespace <b>and every namespace beneath it</b>.
/// Declaring it in <c>AutomationFramework.Tests</c> therefore covers <c>.Api</c>, <c>.Contract</c> and
/// <c>.Ui</c>, giving the once-per-run guarantee without resorting to the global namespace — which NUnit
/// also supports but which trips CA1050 for good reason.
/// </remarks>
[SetUpFixture]
public sealed class GlobalSetup
{
    /// <summary>
    /// Everything that must happen once, before any worker starts, in one method.
    /// </summary>
    /// <remarks>
    /// Deliberately a single <c>[OneTimeSetUp]</c>. NUnit permits several but does not guarantee the order
    /// they run in, and this setup has a real ordering requirement: the expect timeout must be applied before
    /// the browser exists, or UI assertions silently keep the built-in 5s default. Splitting these across two
    /// methods produced exactly that bug, and it presented as a mysterious timeout rather than as a
    /// configuration mistake.
    /// </remarks>
    [OneTimeSetUp]
    public async Task BeforeAllTests()
    {
        // Route framework logging through NUnit rather than raw Console. NUnit attributes progress output to
        // the test that produced it, so with four workers running concurrently the log stays readable
        // instead of interleaving into one stream.
        TestLog.UseSink(message => TestContext.Progress.WriteLine(message));

        // Touching config here means a misconfigured environment fails once, up front, with a message naming
        // the missing key — rather than failing inside every test with a puzzling 401 or a connection error.
        AppConfig config = ConfigLoader.Config;

        // Playwright's web-first assertions keep their OWN timeout, separate from the context default set in
        // PlaywrightFactory. Without this line they stay on the built-in 5s regardless of what the timeout
        // policy says, which is not theoretical: the sign-in test failed with "Expect ToHaveURLAsync with
        // timeout 5000ms" while config asked for 10s, because the login round-trip takes longer than 5s
        // under four parallel workers.
        //
        // One timeout policy is only one policy if every waiting mechanism reads from it.
        Assertions.SetDefaultExpectTimeout(config.Timeouts.ElementMs);

        TestLog.Info($"Suite starting against '{config.EnvName}'.");

        // Created here, once, rather than lazily inside a test's async [SetUp]. See
        // PlaywrightFactory.InitializeAsync for why the lazy version deadlocks rather than merely being slow.
        await PlaywrightFactory.InitializeAsync().ConfigureAwait(false);
    }

    [OneTimeTearDown]
    public async Task AfterAllTests()
    {
        // One browser is shared for the whole assembly, so it is closed once here. Leaving it to process exit
        // would leak the driver process on some hosts.
        await PlaywrightFactory.CloseAsync().ConfigureAwait(false);
    }
}
