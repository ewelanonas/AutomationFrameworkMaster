/**
 * A single product's detail page.
 *
 * Worth noting for anyone writing assertions: the price here renders **without** a
 * currency symbol (`14.15`), while the catalogue card renders it **with** one
 * (`$14.15`). Two different elements, two different formats. Both were read from
 * the live pages, so asserting the detail page's format is deliberate rather than
 * an oversight.
 *
 * No assertions, no `expect`, no config read, and no `page.goto` except through
 * `navigation.toPath`.
 */

import type { Locator, Page } from '@playwright/test';

import * as navigation from '@support/navigation';

const PATH_PREFIX = '/product/';

// The module's only two raw selectors, both scoped inside a test-id container
// because the spec rows and cells carry repeated ids rather than unique ones.
const SPEC_ROW = "[data-test='spec-row']";
const SPEC_VALUE = "[data-test='spec-value']";

export class ProductDetailPage {
  private readonly page: Page;

  readonly productName: Locator;
  readonly unitPrice: Locator;
  readonly description: Locator;
  readonly co2RatingBadge: Locator;
  readonly quantityInput: Locator;
  readonly increaseQuantity: Locator;
  readonly decreaseQuantity: Locator;
  readonly addToCartButton: Locator;
  readonly addToFavoritesButton: Locator;
  readonly specificationsTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productName = page.getByTestId('product-name');
    this.unitPrice = page.getByTestId('unit-price');
    this.description = page.getByTestId('product-description');
    this.co2RatingBadge = page.getByTestId('co2-rating-badge');
    this.quantityInput = page.getByTestId('quantity');
    this.increaseQuantity = page.getByTestId('increase-quantity');
    this.decreaseQuantity = page.getByTestId('decrease-quantity');
    this.addToCartButton = page.getByTestId('add-to-cart');
    this.addToFavoritesButton = page.getByTestId('add-to-favorites');
    this.specificationsTable = page.getByTestId('product-specs');
  }

  /** Opens a product directly by id, skipping the catalogue. */
  async open(productId: string): Promise<ProductDetailPage> {
    await navigation.toPath(this.page, PATH_PREFIX + productId);

    return this;
  }

  async setQuantity(quantity: number): Promise<ProductDetailPage> {
    await this.quantityInput.fill(String(quantity));

    return this;
  }

  async increaseQuantityBy(times: number): Promise<ProductDetailPage> {
    for (let click = 0; click < times; click += 1) {
      await this.increaseQuantity.click();
    }

    return this;
  }

  async addToCart(): Promise<ProductDetailPage> {
    await this.addToCartButton.click();

    return this;
  }

  /**
   * The specification value cell for a named row, for example `Weight`.
   *
   * CSS scoped inside the test-id container, because the row has to be chosen by
   * its text before the value cell can be reached and the rows carry no individual
   * test id.
   */
  specificationValue(specificationName: string): Locator {
    return this.specificationsTable
      .locator(SPEC_ROW)
      .filter({ hasText: specificationName })
      .locator(SPEC_VALUE);
  }

  /**
   * All specification row names, in display order.
   *
   * Resolved in **one** `allInnerTexts()` call, for the same reason as
   * `HomePage.visibleProductNames`: indexing after a separate `count()` is a race
   * whenever the table can re-render. `getByTestId` reaches the same cells the
   * shipped Python object reaches with `locator("[data-test='spec-name']")`, since
   * `testIdAttribute` resolves to `data-test` from config, and it keeps the locator
   * priority rule intact where no row filtering is needed.
   */
  async specificationNames(): Promise<string[]> {
    const cells = this.specificationsTable.getByTestId('spec-name');
    const texts = await cells.allInnerTexts();
    const names: string[] = [];

    for (const text of texts) {
      names.push(text.trim());
    }

    return names;
  }
}
