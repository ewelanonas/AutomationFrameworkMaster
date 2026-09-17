using AutomationFramework.Core.Support;
using Microsoft.Playwright;

namespace AutomationFramework.Core.Pages;

/// <summary>
/// The signed-in account overview. Reaching this page is the observable outcome of a successful login.
/// </summary>
public sealed class AccountPage
{
    private const string Path = "/account";

    private readonly IPage _page;

    public AccountPage(IPage page)
    {
        _page = page;
        PageTitle = page.GetByTestId("page-title");
        UserMenu = page.GetByTestId("nav-menu");
        SignOutLink = page.GetByTestId("nav-sign-out");
        FavoritesLink = page.GetByTestId("nav-my-favorites");
        ProfileLink = page.GetByTestId("nav-my-profile");
        InvoicesLink = page.GetByTestId("nav-my-invoices");
    }

    public ILocator PageTitle { get; }

    public ILocator UserMenu { get; }

    public ILocator SignOutLink { get; }

    public ILocator FavoritesLink { get; }

    public ILocator ProfileLink { get; }

    public ILocator InvoicesLink { get; }

    public async Task<AccountPage> OpenAsync()
    {
        await Navigation.ToAsync(_page, Path).ConfigureAwait(false);
        return this;
    }

    /// <summary>Opens the user dropdown, which holds sign-out and the account links.</summary>
    public async Task<AccountPage> OpenUserMenuAsync()
    {
        await UserMenu.ClickAsync().ConfigureAwait(false);
        return this;
    }

    public async Task<HomePage> SignOutAsync()
    {
        await OpenUserMenuAsync().ConfigureAwait(false);
        await SignOutLink.ClickAsync().ConfigureAwait(false);
        return new HomePage(_page);
    }
}
