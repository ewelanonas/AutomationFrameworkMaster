package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * The signed-in account overview. Reaching this page is the observable outcome of a successful
 * login.
 */
public final class AccountPage {

  private static final String PATH = "/account";

  private final Page page;

  public final Locator pageTitle;
  public final Locator userMenu;
  public final Locator signOutLink;
  public final Locator favoritesLink;
  public final Locator profileLink;
  public final Locator invoicesLink;

  public AccountPage(Page page) {
    this.page = page;
    this.pageTitle = page.getByTestId("page-title");
    this.userMenu = page.getByTestId("nav-menu");
    this.signOutLink = page.getByTestId("nav-sign-out");
    this.favoritesLink = page.getByTestId("nav-my-favorites");
    this.profileLink = page.getByTestId("nav-my-profile");
    this.invoicesLink = page.getByTestId("nav-my-invoices");
  }

  public AccountPage open() {
    page.navigate(PATH);
    return this;
  }

  /** Opens the user dropdown, which holds sign-out and the account links. */
  public AccountPage openUserMenu() {
    userMenu.click();
    return this;
  }

  public HomePage signOut() {
    openUserMenu();
    signOutLink.click();
    return new HomePage(page);
  }
}
