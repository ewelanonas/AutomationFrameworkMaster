using Allure.NUnit;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;
using AwesomeAssertions;
using AwesomeAssertions.Execution;
using NUnit.Framework;

namespace AutomationFramework.Tests.Api;

/// <summary>
/// Authentication behaviour, including the boundary cases that matter most.
/// </summary>
/// <remarks>
/// Every test here registers its own disposable account. That is not ceremony: sending a wrong password
/// increments a server-side failed-attempt counter, and on a shared account that counter eventually trips a
/// lockout. When it did, the API answered <c>423 Locked</c> to every login and took both language modules
/// down at once. A shared account is shared mutable state; the house rules say tests own their data, and this
/// is what that rule is protecting against.
/// <para>
/// The statuses asserted here were observed against the running service, not assumed. One is worth reading
/// twice: a login request with the <c>password</c> field <b>missing entirely</b> returns <b>401</b>, not the
/// 422 a validation failure would normally produce. The test asserts what the API does, and the inconsistency
/// is recorded in <c>shared/contracts/README.md</c> to raise with the API owners.
/// </para>
/// </remarks>
[TestFixture]
[AllureNUnit]
[Category("Regression")]
public sealed class AuthApiTests : ApiTestBase
{
    [Test]
    [Category("Smoke")]
    [Description("Valid credentials are accepted and a bearer token is issued.")]
    public async Task ShouldIssueToken_WhenCredentialsAreValid()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        ApiResult<LoginResponse> result = await Auth.LoginAsync(account.Email, account.Password);

        result.Status.Should().Be(200, "valid credentials must be accepted");

        LoginResponse login = result.Body!;

        using AssertionScope scope = new();
        login.AccessToken.Should().NotBeNullOrWhiteSpace("a token is issued");
        login.AccessToken.Should().MatchRegex(
            "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$", "the token is a three-part JWT");
        login.TokenType.Should().BeEquivalentTo("bearer", "the scheme is bearer");
        login.ExpiresIn.Should().NotBeNull().And.BePositive("the token expires");
    }

    [Test]
    [Description("A freshly issued token is accepted on a protected endpoint.")]
    public async Task ShouldGrantAccessToOwnProfile_WhenTokenIsValid()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        ApiResult<LoginResponse> login = await Auth.LoginAsync(account.Email, account.Password);
        login.Status.Should().Be(200);

        ApiResult<NoBody> profile = await Auth.CurrentUserAsync(login.Body!.BearerHeaderValue());

        profile.Status.Should().Be(200, "a freshly issued token must be accepted");
    }

    [Test]
    [Category("Smoke")]
    [Description("A wrong password is rejected without revealing whether the account exists.")]
    public async Task ShouldRejectLogin_WhenPasswordIsWrong()
    {
        // A disposable account, because this test deliberately fails a login and so moves the account
        // towards a lockout. Doing that to an account anything else uses is how a whole suite goes red.
        TestAccount account = await Accounts.CreateCustomerAsync();

        ApiResult<LoginResponse> result = await Auth.LoginAsync(
            account.Email, "definitely-not-the-password");

        using (AssertionScope scope = new())
        {
            result.Status.Should().Be(401, "wrong credentials are unauthorized");
            result.Body.Should().BeNull("no token is issued on a failed login");
        }

        ApiError error = result.Error();
        error.Text().Should().NotBeNullOrWhiteSpace("the rejection is explained");

        // The wording must not distinguish "wrong password" from "no such account", or anyone can enumerate
        // which email addresses hold accounts.
        error.Text()!.Should().NotContainEquivalentOf("password is incorrect");
        error.Text()!.Should().NotContainEquivalentOf("user not found");
        error.Text()!.Should().NotContainEquivalentOf("no such user");

        ProductCatalogueApiTests.AssertNoInternalDetailLeaked(result.RawBody);
    }

    [Test]
    [Description("A request missing a required field is refused, not partially processed.")]
    public async Task ShouldRejectLogin_WhenPasswordFieldIsMissing()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        LoginRequest incomplete = LoginRequest.WithoutPassword(account.Email);

        ApiResult<LoginResponse> result = await Auth.LoginAsync(incomplete);

        // Observed behaviour: 401, not 422. Asserted as-is; see the class remarks.
        result.Status.Should().Be(401, "a request missing a required field must be refused");
        result.Body.Should().BeNull("no token is issued");
        result.Error().Text().Should().NotBeNullOrWhiteSpace("the refusal is explained");
    }

    [Test]
    [Description("An unknown account is indistinguishable from a wrong password.")]
    public async Task ShouldRejectLogin_WhenAccountIsUnknown()
    {
        ApiResult<LoginResponse> result = await Auth.LoginAsync(
            TestValues.UniqueEmail(), "any-password");

        result.Status.Should().Be(401, "an unknown account is unauthorized");
        result.Body.Should().BeNull();
    }

    [Test]
    [Category("Destructive")]
    [Description("Repeated failed logins lock the account rather than allowing unlimited guesses.")]
    public async Task ShouldLockAccount_WhenFailedAttemptsAreRepeated()
    {
        // This test exists because the lockout was discovered the hard way, by accidentally triggering it on
        // a shared account. Behaviour a suite can break itself on is behaviour worth asserting deliberately.
        //
        // It is destructive by design, which is exactly why it gets its own throwaway account.
        TestAccount account = await Accounts.CreateCustomerAsync();

        int lockedAtAttempt = 0;

        for (int attempt = 1; attempt <= 10; attempt++)
        {
            ApiResult<LoginResponse> result = await Auth.LoginAsync(account.Email, "wrong-password");

            if (result.Status == 423)
            {
                lockedAtAttempt = attempt;
                break;
            }

            result.Status.Should().Be(
                401, $"attempt {attempt} should be rejected as unauthorized until the lockout trips");
        }

        lockedAtAttempt.Should().BePositive(
            "the account must lock after repeated failures, otherwise credentials can be brute forced");

        ApiResult<LoginResponse> afterLock = await Auth.LoginAsync(account.Email, account.Password);
        afterLock.Status.Should().Be(
            423, "once locked, even the correct password must be refused until an administrator intervenes");
    }

    [Test]
    [Category("Smoke")]
    [Description("Anonymous access to a protected endpoint is denied.")]
    public async Task ShouldDenyProtectedEndpoint_WhenNoTokenIsSupplied()
    {
        ApiResult<NoBody> result = await Auth.CurrentUserAsync(null);

        result.Status.Should().Be(
            401, "anonymous access to a protected endpoint must be 401, never 200 and never 500");

        ProductCatalogueApiTests.AssertNoInternalDetailLeaked(result.RawBody);
    }

    [Test]
    [Description("A token whose signature no longer verifies is rejected.")]
    public async Task ShouldDenyProtectedEndpoint_WhenTokenIsTampered()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        ApiResult<LoginResponse> login = await Auth.LoginAsync(account.Email, account.Password);
        login.Status.Should().Be(200);

        string tampered = FlipLastCharacter(login.Body!.AccessToken);

        ApiResult<NoBody> result = await Auth.CurrentUserAsync("Bearer " + tampered);

        result.Status.Should().Be(401, "a token whose signature no longer verifies must be rejected");
    }

    /// <summary>Changes the final character so the JWT signature fails but the shape stays intact.</summary>
    private static string FlipLastCharacter(string token)
    {
        char last = token[^1];
        char replacement = last == 'A' ? 'B' : 'A';
        return string.Concat(token.AsSpan(0, token.Length - 1), replacement.ToString());
    }
}
