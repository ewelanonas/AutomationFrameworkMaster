/**
 * The signed-in account overview.
 *
 * Reaching this page is the observable outcome of a successful login.
 */

import type { Locator, Page } from '@playwright/test';

import * as navigation from '@support/navigation';

// The four page objects form a navigation cycle — home -> login -> account -> home.
// C# and Java resolve it at compile time and Python has to break it with a local
// import; TypeScript resolves it as written, and it is safe here because the
// `HomePage` constructor runs at method-call time rather than at module-evaluation
// time, so the binding is initialised by then. If the ESM runtime ever complains,
// the fallback is a type-only import plus a dynamic `await import()` in `signOut()`.
import { HomePage } from './homePage';

const PATH = '/account';

export class AccountPage {
  private readonly page: Page;

  readonly pageTitle: Locator;
  readonly userMenu: Locator;
  readonly signOutLink: Locator;
  readonly favoritesLink: Locator;
  readonly profileLink: Locator;
  readonly invoicesLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByTestId('page-title');
    this.userMenu = page.getByTestId('nav-menu');
    this.signOutLink = page.getByTestId('nav-sign-out');
    this.favoritesLink = page.getByTestId('nav-my-favorites');
    this.profileLink = page.getByTestId('nav-my-profile');
    this.invoicesLink = page.getByTestId('nav-my-invoices');
  }

  async open(): Promise<AccountPage> {
    await navigation.toPath(this.page, PATH);

    return this;
  }

  /** Opens the user dropdown, which holds sign-out and the account links. */
  async openUserMenu(): Promise<AccountPage> {
    await this.userMenu.click();

    return this;
  }

  /** Signs out and returns the catalogue the application lands on. */
  async signOut(): Promise<HomePage> {
    await this.openUserMenu();
    await this.signOutLink.click();

    return new HomePage(this.page);
  }
}
