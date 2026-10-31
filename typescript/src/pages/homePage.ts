/**
 * The catalogue landing page: search, sort, filters, product grid, pagination.
 *
 * Locators are built once in the constructor and exposed as `readonly Locator`
 * properties. No assertions live here, so this page object is equally usable by a
 * test expecting results and one expecting none.
 *
 * Every locator uses `getByTestId`, which resolves against the `data-test`
 * attribute `playwright.config.ts` applied from config. No page object mentions
 * either attribute name. The ids were read off the shipped C#, Java and Python
 * page objects, which in turn read them from the live DOM — not guessed.
 *
 * The constructor does not navigate; `open()` does. A test that arrives at this
 * screen by clicking does not navigate to it again.
 *
 * Methods are declared as **methods**, never as arrow properties, so they appear
 * properly in stack traces and read the same as the other three modules.
 *
 * This page object mirrors the shipped ones in full, including locators and
 * actions no test yet calls. A page object is the documentation of a screen, so
 * the next test to need a control reads its test id off here instead of
 * rediscovering it in the DOM, and a locator costs one line that cannot rot
 * silently — if the test id changes, the test that uses it fails. The one
 * deliberate omission is C#'s `VisibleProductCountAsync`: no test calls it, and
 * the no-`count()` rule below forbids reintroducing it.
 */

import type { Locator, Page } from '@playwright/test';

import * as navigation from '@support/navigation';

import { LoginPage } from './loginPage';
import { ProductDetailPage } from './productDetailPage';

const PATH = '/';
const PRODUCT_CARD_PREFIX = 'product-';

export class HomePage {
  private readonly page: Page;

  readonly searchInput: Locator;
  readonly searchSubmit: Locator;
  readonly searchReset: Locator;
  readonly sortSelect: Locator;
  readonly productNames: Locator;
  readonly productPrices: Locator;
  readonly paginationNext: Locator;
  readonly paginationPrevious: Locator;
  readonly signInLink: Locator;
  readonly ecoFriendlyFilter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByTestId('search-query');
    this.searchSubmit = page.getByTestId('search-submit');
    this.searchReset = page.getByTestId('search-reset');
    this.sortSelect = page.getByTestId('sort');
    this.productNames = page.getByTestId('product-name');
    this.productPrices = page.getByTestId('product-price');
    this.paginationNext = page.getByTestId('pagination-next');
    this.paginationPrevious = page.getByTestId('pagination-prev');
    this.signInLink = page.getByTestId('nav-sign-in');
    this.ecoFriendlyFilter = page.getByTestId('eco-friendly-filter');
  }

  /** Opens the catalogue. The base URL comes from config, so no absolute URL here. */
  async open(): Promise<HomePage> {
    await navigation.toPath(this.page, PATH);

    return this;
  }

  /** Runs a search. Results render in place, so this returns the same page object. */
  async search(query: string): Promise<HomePage> {
    await this.searchInput.fill(query);
    await this.searchSubmit.click();

    return this;
  }

  /** Clears the current search. */
  async resetSearch(): Promise<HomePage> {
    await this.searchReset.click();

    return this;
  }

  /** A single product card, addressed by product id. */
  productCard(productId: string): Locator {
    return this.page.getByTestId(PRODUCT_CARD_PREFIX + productId);
  }

  /** The out-of-stock badge inside a given card. Absent when the product is in stock. */
  outOfStockBadgeIn(productId: string): Locator {
    return this.productCard(productId).getByTestId('out-of-stock');
  }

  /** Opens a product's detail page by clicking its card. */
  async openProduct(productId: string): Promise<ProductDetailPage> {
    await this.productCard(productId).click();

    return new ProductDetailPage(this.page);
  }

  /** Goes to the sign-in page. */
  async openSignIn(): Promise<LoginPage> {
    await this.signInLink.click();

    return new LoginPage(this.page);
  }

  /** Moves to the next page of results. */
  async goToNextPage(): Promise<HomePage> {
    await this.paginationNext.click();

    return this;
  }

  /** Selects a sort option by its visible label, for example `Name (A - Z)`. */
  async sortBy(visibleLabel: string): Promise<HomePage> {
    await this.sortSelect.selectOption({ label: visibleLabel });

    return this;
  }

  /**
   * Visible product names in display order.
   *
   * Uses **one** `allInnerTexts()` call, which resolves the whole set at once,
   * rather than reading `count()` and then indexing with `nth(i)`.
   *
   * That is not stylistic. The count-then-index version has a race: the count is
   * taken against the grid as it is now, and if the grid re-renders mid-loop —
   * which it does after a search or a page change — `nth(i)` waits for an element
   * that no longer exists and the test times out at the element timeout. The Java
   * module hit exactly that failure, 9 cards to 6 after a search, before the same
   * fix. `count()` appears nowhere in this module and `no-restricted-syntax`
   * enforces it.
   *
   * A plain `for...of` rather than a `map`, matching the C#, Java and Python
   * bodies line for line.
   */
  async visibleProductNames(): Promise<string[]> {
    const texts = await this.productNames.allInnerTexts();
    const names: string[] = [];

    for (const text of texts) {
      names.push(text.trim());
    }

    return names;
  }
}
