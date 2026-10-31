/**
 * Browsing the catalogue in a real browser.
 *
 * Only behaviour that genuinely needs a browser lives here. The search *rules* are
 * covered far more cheaply and thoroughly in `tests/api/productCatalogue.spec.ts`;
 * what this file checks is that the page renders what the API returned, and that
 * navigation works.
 *
 * Expectations always come from the API, never from reading the page first. A UI
 * test that derives its expectation from the same page it is checking proves only
 * that the page agrees with itself.
 *
 * Page objects are constructed in the test body from the `page` fixture, which is
 * what all three shipped modules do. There are deliberately no page-object
 * fixtures: a `homePage` fixture would hide which screen a test starts on and
 * quietly couple the starting state to a fixture's body.
 *
 * Every indexed read and every nullish dereference goes through `requireValue`,
 * never through an `if` and never through `!`.
 */

import type { ProductsClient } from '@clients/productsClient';
import { isEmpty } from '@models/pagedProducts';
import type { Product } from '@models/product';
import { HomePage } from '@pages/homePage';
import { ProductDetailPage } from '@pages/productDetailPage';
import * as consoleErrorPolicy from '@support/consoleErrorPolicy';
import { expect, uiTest as test } from '@support/fixtures';
import { requireValue } from '@support/require';

const SEARCH_TERM = 'Hammer';

/**
 * Fetches a product over the API to use as the expectation.
 *
 * Throws naming the status when page 1 comes back empty, rather than indexing
 * blindly: an unreachable or empty catalogue is a setup failure, and saying so
 * beats an exception three frames away from the cause.
 *
 * It lives in this file because only this file uses it. If `signIn.spec.ts` ever
 * needs it, it moves to a fixture — never cross-imported from another spec.
 */
async function firstProductFromApi(productsClient: ProductsClient): Promise<Product> {
  const result = await productsClient.listPage(1);

  if (result.status !== 200 || result.body === undefined || isEmpty(result.body)) {
    throw new Error(
      'The catalogue API must return a populated first page to set up this test, but ' +
        `answered ${String(result.status)}. Body: ${result.rawBody}`,
    );
  }

  return requireValue(result.body.data[0], 'the first product on catalogue page 1');
}

test.describe('Product browsing', () => {
  test(
    'shows only matching products when searching by name',
    { tag: ['@smoke', '@regression'] },
    async ({ page }) => {
      const home = new HomePage(page);
      await home.open();

      await home.search(SEARCH_TERM);

      // Two web-first assertions, in this order, and the second one is the point.
      //
      // toBeVisible() alone passes immediately, because the pre-search grid is already
      // on screen. Reading the names straight after it enumerates a grid that is still
      // mid-re-render, which is a race. toContainText retries until the first card is
      // actually a search result, which is the observable signal that the re-render
      // finished. No sleep, and nothing to tune.
      await expect(home.productNames.first()).toBeVisible();
      await expect(home.productNames.first()).toContainText(SEARCH_TERM);

      const shown = await home.visibleProductNames();

      expect(shown.length, 'the search returned something to check').toBeGreaterThan(0);

      for (const name of shown) {
        expect(
          name.toLowerCase(),
          `the grid shows '${name}', which does not match the search term '${SEARCH_TERM}'`,
        ).toContain(SEARCH_TERM.toLowerCase());
      }
    },
  );

  test(
    'opens the detail page matching the card',
    { tag: ['@smoke', '@regression'] },
    async ({ page, productsClient }) => {
      const expected = await firstProductFromApi(productsClient);

      const home = new HomePage(page);
      await home.open();
      const detail = await home.openProduct(expected.id);

      // The card renders the price with a currency symbol, the detail page without
      // one. Both were read from the live pages; asserting the detail page's format
      // here is deliberate, not an oversight. toFixed(2) is the analogue of Python's
      // quantize(Decimal('0.01')): the detail page renders money to the cent, and the
      // JSON literal's trailing zero does not survive parsing.
      await expect(detail.productName).toHaveText(expected.name);
      await expect(detail.unitPrice).toHaveText(expected.price.toFixed(2));
    },
  );

  test(
    'renders specifications when a product is opened',
    { tag: ['@regression'] },
    async ({ page, productsClient }) => {
      const expected = await firstProductFromApi(productsClient);

      const detail = new ProductDetailPage(page);
      await detail.open(expected.id);

      await expect(detail.specificationsTable).toBeVisible();

      const specificationNames = await detail.specificationNames();

      expect(
        specificationNames.length,
        'a product detail page lists its specifications',
      ).toBeGreaterThan(0);
    },
  );

  test(
    'moves to the second page without repeating products',
    { tag: ['@regression'] },
    async ({ page }) => {
      const home = new HomePage(page);
      await home.open();

      await expect(home.productNames.first()).toBeVisible();
      const firstPageNames = await home.visibleProductNames();
      const firstNameOnPageOne = requireValue(
        firstPageNames[0],
        'the first product name on catalogue page 1',
      );

      await home.goToNextPage();

      // Waiting on the observable change rather than on time: the first name differs
      // once the new page has rendered, and Playwright retries until it does.
      await expect(home.productNames.first()).not.toHaveText(firstNameOnPageOne);

      const secondPageNames = await home.visibleProductNames();

      for (const name of secondPageNames) {
        expect(
          firstPageNames,
          `'${name}' appeared on both pages, so the second page repeats the first`,
        ).not.toContain(name);
      }
    },
  );

  test(
    'loads the catalogue without unexpected console errors',
    { tag: ['@regression'] },
    async ({ page, consoleErrors }) => {
      const home = new HomePage(page);
      await home.open();
      await expect(home.productNames.first()).toBeVisible();

      // Filtered through the reviewed allowlist rather than asserted empty. The live
      // application fires an authenticated request on the anonymous catalogue page and
      // logs the resulting 401 on every load; a blanket zero would be red on every run
      // and would get deleted within a week, taking the useful part of the check with it.
      const unexpected = consoleErrorPolicy.significant(consoleErrors);

      expect(
        unexpected,
        'the catalogue page logged a console error that is not on the reviewed allowlist in ' +
          'consoleErrorPolicy. Either the page has a new defect, or the allowlist needs a new ' +
          'entry with a documented reason.',
      ).toEqual([]);
    },
  );
});
