namespace AutomationFramework.Core.Support;

/// <summary>
/// Typed, immutable view of the resolved environment.
/// </summary>
/// <remarks>
/// Nothing in the suite reads <c>Environment.GetEnvironmentVariable</c> directly. Everything goes
/// through this record, so there is one place to look when a value is wrong and one place to change
/// when a setting is added.
/// </remarks>
public sealed record AppConfig(
    string EnvName,
    UiConfig Ui,
    ApiConfig Api,
    Timeouts Timeouts,
    ExecutionConfig Execution,
    Credentials Credentials);

/// <summary>Browser-facing settings. Locale and timezone are pinned so date formatting is deterministic.</summary>
public sealed record UiConfig(
    string BaseUrl,
    string Locale,
    string TimezoneId,
    int ViewportWidth,
    int ViewportHeight);

/// <summary>Service-facing settings.</summary>
public sealed record ApiConfig(string BaseUrl, string LoginPath);

/// <summary>
/// The single timeout policy. Tests and page objects never write a millisecond literal; they ask for
/// the named timeout that matches what they are waiting on.
/// </summary>
public sealed record Timeouts(int ElementMs, int NavigationMs, int ApiMs, int WorkflowMs);

/// <summary>How the run executes. <c>TestIdAttribute</c> is per-application, not universal.</summary>
public sealed record ExecutionConfig(bool Headless, string Browser, string TestIdAttribute);

/// <summary>
/// Test-account credentials, supplied only through the environment.
/// </summary>
/// <remarks>
/// Accessed through <see cref="RequireUsername"/> rather than a plain property. That way a suite of
/// API and contract tests that needs no login still runs, while a test that does need one fails
/// immediately with a message naming the missing variable, instead of sending an empty password and
/// reporting a puzzling 401.
/// </remarks>
public sealed record Credentials(
    string? Username,
    string? Password,
    string? AdminUsername,
    string? AdminPassword)
{
    public string RequireUsername() => Require(Username, "AF_AUTH_USERNAME");

    public string RequirePassword() => Require(Password, "AF_AUTH_PASSWORD");

    public string RequireAdminUsername() => Require(AdminUsername, "AF_AUTH_ADMIN_USERNAME");

    public string RequireAdminPassword() => Require(AdminPassword, "AF_AUTH_ADMIN_PASSWORD");

    /// <summary>True when the customer credentials are present, for tests that skip rather than fail.</summary>
    public bool HasCustomerCredentials
        => !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password);

    private static string Require(string? value, string variableName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"This test needs a credential that is not configured: {variableName}. "
                + "Copy .env.example to .env and fill it in, or export the variable. "
                + "See .env.example for the demo values.");
        }

        return value;
    }
}
