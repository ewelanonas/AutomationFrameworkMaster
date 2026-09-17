using AutomationFramework.Core.Support;
using Microsoft.Playwright;

namespace AutomationFramework.Core.Pages;

/// <summary>
/// The sign-in page.
/// </summary>
/// <remarks>
/// <see cref="SubmitAsync"/> does not assert success and does not return the account page, because a
/// failed login stays on this page. Deciding what happened is the test's job â€” that is what keeps this
/// object usable for both the happy path and the invalid-credentials case.
/// </remarks>
public sealed class LoginPage
{
    private const string Path = "/auth/login";

    private readonly IPage _page;

    public LoginPage(IPage page)
    {
        _page = page;
        Form = page.GetByTestId("login-form");
        EmailInput = page.GetByTestId("email");
        PasswordInput = page.GetByTestId("password");
        SubmitButton = page.GetByTestId("login-submit");
        ErrorMessage = page.GetByTestId("login-error");
        RegisterLink = page.GetByTestId("register-link");
        ForgotPasswordLink = page.GetByTestId("forgot-password-link");
    }

    public ILocator Form { get; }

    public ILocator EmailInput { get; }

    public ILocator PasswordInput { get; }

    public ILocator SubmitButton { get; }

    public ILocator ErrorMessage { get; }

    public ILocator RegisterLink { get; }

    public ILocator ForgotPasswordLink { get; }

    public async Task<LoginPage> OpenAsync()
    {
        await Navigation.ToAsync(_page, Path).ConfigureAwait(false);
        return this;
    }

    public async Task<LoginPage> EnterEmailAsync(string email)
    {
        await EmailInput.FillAsync(email).ConfigureAwait(false);
        return this;
    }

    public async Task<LoginPage> EnterPasswordAsync(string password)
    {
        await PasswordInput.FillAsync(password).ConfigureAwait(false);
        return this;
    }

    public async Task<LoginPage> SubmitAsync()
    {
        await SubmitButton.ClickAsync().ConfigureAwait(false);
        return this;
    }

    /// <summary>Fills both fields and submits. Whether it succeeded is for the test to assert.</summary>
    public async Task<LoginPage> SignInAsync(string email, string password)
    {
        await EnterEmailAsync(email).ConfigureAwait(false);
        await EnterPasswordAsync(password).ConfigureAwait(false);
        return await SubmitAsync().ConfigureAwait(false);
    }

    /// <summary>The account page object. Call only after asserting the sign-in succeeded.</summary>
    public AccountPage AccountPage() => new(_page);
}
