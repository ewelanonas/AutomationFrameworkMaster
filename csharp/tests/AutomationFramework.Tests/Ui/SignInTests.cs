using System.Text.RegularExpressions;
using Allure.NUnit;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Pages;
using AutomationFramework.Core.Support;
using Microsoft.Playwright;
using NUnit.Framework;

namespace AutomationFramework.Tests.Ui;

/// <summary>
/// Sign-in through the form.
/// </summary>
/// <remarks>
/// This is the one place the login form is used. Every other UI test seeds its session over the API via
/// <c>AuthFlow</c>, because signing in through the form before every test is usually the largest single waste
/// of time in a suite, and it makes every unrelated test depend on the login screen working.
/// <para>
/// Each test registers its own disposable account. The negative test deliberately fails a login, which moves
/// an account towards a server-side lockout — and doing that to a shared account locked it out from under
/// both language modules once already.
/// </para>
/// <para>
/// The error message asserted here was read from the running application. Note that the UI says "Invalid
/// email or password" while the API says "Unauthorized" for the same rejection: different layers, different
/// wording, and a test that assumes they match would fail for no useful reason.
/// </para>
/// </remarks>
[TestFixture]
[AllureNUnit]
[Category("Regression")]
public sealed class SignInTests : UiTestBase
{
    [Test]
    [Category("Smoke")]
    [Description("Valid credentials reach the account page.")]
    public async Task ShouldReachAccountPage_WhenCredentialsAreValid()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        LoginPage login = new(Page);
        await login.OpenAsync();

        await login.SignInAsync(account.Email, account.Password);

        AccountPage accountPage = login.AccountPage();
        await Assertions.Expect(Page).ToHaveURLAsync(new Regex(".*/account.*"));
        await Assertions.Expect(accountPage.PageTitle).ToBeVisibleAsync();
        await Assertions.Expect(accountPage.UserMenu).ToBeVisibleAsync();
    }

    [Test]
    [Category("Smoke")]
    [Description("A wrong password shows an error and leaves the user on the form.")]
    public async Task ShouldShowError_WhenPasswordIsWrong()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        LoginPage login = new(Page);
        await login.OpenAsync();

        await login.SignInAsync(account.Email, "definitely-not-the-password");

        await Assertions.Expect(login.ErrorMessage).ToBeVisibleAsync();
        await Assertions.Expect(login.ErrorMessage).ToHaveTextAsync("Invalid email or password");

        // Staying on the form matters as much as the message: a failed login that navigates away would leave
        // the user with no way to correct the mistake.
        await Assertions.Expect(login.Form).ToBeVisibleAsync();
        await Assertions.Expect(Page).ToHaveURLAsync(new Regex(".*/auth/login.*"));
    }

    [Test]
    [Description("An unknown email produces the same message as a wrong password.")]
    public async Task ShouldNotRevealWhetherAccountExists_WhenEmailIsUnknown()
    {
        LoginPage login = new(Page);
        await login.OpenAsync();

        await login.SignInAsync(TestValues.UniqueEmail(), "any-password");

        // The same wording as a wrong password, deliberately. A distinct message here would let anyone
        // enumerate which email addresses hold accounts.
        await Assertions.Expect(login.ErrorMessage).ToHaveTextAsync("Invalid email or password");
    }

    [Test]
    [Description("A session seeded over the API skips the login form entirely.")]
    public async Task ShouldSkipLoginForm_WhenSessionIsSeededViaApi()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        await AuthFlow.SignInViaApiAsync(BrowserContext, account.Email, account.Password);

        AccountPage accountPage = new(Page);
        await accountPage.OpenAsync();

        // No form was touched. This is the pattern every other UI test in the suite uses, and it is worth one
        // test of its own so a regression in the seeding mechanism is reported here rather than as a
        // confusing cascade of unrelated failures.
        await Assertions.Expect(accountPage.PageTitle).ToBeVisibleAsync();
        await Assertions.Expect(accountPage.UserMenu).ToBeVisibleAsync();
    }
}
