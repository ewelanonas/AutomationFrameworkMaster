using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Flows;
using AutomationFramework.Core.Support;
using NUnit.Framework;

namespace AutomationFramework.Tests;

/// <summary>
/// One thin base class for API and contract tests: clients, config, and per-test log scope.
/// </summary>
/// <remarks>
/// It stays thin on purpose. A base class that accumulates helpers becomes the place nobody can safely
/// change, and it hides where behaviour comes from.
/// <para>
/// Clients are constructed per test instance, not shared statically. NUnit creates a fresh fixture
/// instance per test, so there is no shared mutable state to leak between them.
/// </para>
/// </remarks>
public abstract class ApiTestBase
{
    protected AppConfig Config { get; } = ConfigLoader.Config;

    protected ProductsClient Products { get; } = new(ApiHttp.Client);

    protected AuthClient Auth { get; } = new(ApiHttp.Client);

    protected UsersClient Users { get; } = new(ApiHttp.Client);

    /// <summary>
    /// Registers disposable accounts. Any test that signs in uses one of these rather than a shared account.
    /// </summary>
    protected AccountFlow Accounts { get; } = new(new UsersClient(ApiHttp.Client));

    [SetUp]
    public void BeginLogScope() => TestLog.BeginScope(TestContext.CurrentContext.Test.Name);

    [TearDown]
    public void EndLogScope() => TestLog.EndScope();
}
