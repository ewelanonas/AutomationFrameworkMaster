/**
 * Catalogue read behaviour.
 *
 * Note what these tests deliberately do **not** assert: that the catalogue holds
 * exactly 50 products. That number is true today and is part of no contract, so
 * asserting it would produce a red suite the day someone adds a product. The
 * assertions target invariants instead — page size is respected, `from`/`to` agree
 * with the page contents, `last_page` follows from `total`, and no product appears
 * on two pages. Those hold regardless of how much data exists.
 *
 * **No hardcoded product ids**, anywhere. The demo data is reseeded, and an id
 * captured one hour returns 404 the next, so every test that needs one fetches it
 * from the catalogue first.
 *
 * Every indexed read and every nullish dereference goes through `requireValue`,
 * never through an `if` and never through `!`. `noUncheckedIndexedAccess` makes
 * `data[0]` a `Product | undefined`, the models declare the optional catalogue
 * fields with `.nullish()`, `playwright/no-conditional-in-test` bans the `if` a
 * guard would otherwise be, and `no-non-null-assertion` bans the `!`. One named
 * helper satisfies all four, and its message distinguishes an unusable arrangement
 * from a failed assertion.
 */

import { errorOf } from '@clients/apiResult';
import { errorText } from '@models/apiError';
import { idsOf, isEmpty, size } from '@models/pagedProducts';
import { requireValue } from '@support/require';
import * as testValues from '@support/testValues';

import { expect, test } from './fixtures';

const SEARCH_TERM = 'Hammer';
const PAGES_TO_CHECK_FOR_DUPLICATES = 4;
const PAGE_BEYOND_THE_END = 9999;
const REQUESTED_PAGES = [1, 2, 3];

/** `last_page` as the envelope's own numbers imply it. */
function expectedLastPage(total: number, perPage: number): number {
  if (total === 0) {
    return 1;
  }

  const fullPages = Math.floor(total / perPage);
  if (total % perPage === 0) {
    return fullPages;
  }

  return fullPages + 1;
}

test.describe('Product catalogue API', () => {
  test(
    'returns a self-consistent envelope when the catalogue is listed',
    { tag: ['@smoke', '@regression'] },
    async ({ productsClient }) => {
      const result = await productsClient.listPage(1);

      expect(result.status, 'listing the catalogue must succeed').toBe(200);

      const page = requireValue(result.body, 'the pagination envelope for catalogue page 1');

      expect(page.current_page, 'the response echoes the requested page').toBe(1);
      expect(page.per_page, 'page size is advertised').toBeGreaterThan(0);
      expect(
        size(page),
        'a page never carries more items than the advertised page size',
      ).toBeLessThanOrEqual(page.per_page);
      expect(page.total, 'total item count is advertised').toBeGreaterThan(0);
      expect(page.from, 'the first page starts at item 1').toBe(1);
      expect(page.to, "'to' agrees with the number of items actually returned").toBe(size(page));
      expect(page.last_page, 'last_page follows from total and per_page').toBe(
        expectedLastPage(page.total, page.per_page),
      );
    },
  );

  test(
    'returns populated products when the catalogue is listed',
    { tag: ['@smoke', '@regression'] },
    async ({ productsClient }) => {
      const result = await productsClient.listPage(1);

      expect(result.status, 'listing the catalogue must succeed').toBe(200);

      const page = requireValue(result.body, 'the pagination envelope for catalogue page 1');
      const firstProduct = requireValue(page.data[0], 'the first product on catalogue page 1');
      const category = requireValue(firstProduct.category, "the first product's category");
      const brand = requireValue(firstProduct.brand, "the first product's brand");

      expect.soft(firstProduct.id.trim(), 'id is present').not.toBe('');
      expect.soft(firstProduct.name.trim(), 'name is present').not.toBe('');
      expect.soft(firstProduct.price, 'price is a positive amount').toBeGreaterThan(0);
      expect.soft(typeof firstProduct.in_stock, 'the stock flag is present').toBe('boolean');
      expect(category.name.trim(), 'category is expanded, not just an id').not.toBe('');
      expect(brand.name.trim(), 'brand is expanded, not just an id').not.toBe('');
    },
  );

  test(
    'returns the requested product when the id exists',
    { tag: ['@regression'] },
    async ({ productsClient }) => {
      const listing = await productsClient.listPage(1);
      expect(listing.status, 'listing the catalogue must succeed').toBe(200);

      const listPage = requireValue(listing.body, 'the pagination envelope for catalogue page 1');
      const fromList = requireValue(listPage.data[0], 'the first product on catalogue page 1');

      const result = await test.step('fetch the same product by id', async () => {
        return productsClient.getById(fromList.id);
      });

      expect(result.status, 'a product that the listing showed must be fetchable').toBe(200);

      const detail = requireValue(result.body, 'the product detail body');

      // Compared field by field, excluding specs and category: the detail endpoint
      // expands specifications and the list endpoint omits them, and the detail
      // response adds parent_id to the category. A whole-object comparison would fail
      // on a real difference that is not a defect.
      expect.soft(detail.id, 'id is the same product').toBe(fromList.id);
      expect.soft(detail.name, 'name is the same product').toBe(fromList.name);
      expect.soft(detail.description, 'description is the same product').toBe(fromList.description);
      expect.soft(detail.price, 'price is the same product').toBe(fromList.price);
      expect.soft(detail.in_stock, 'stock flag is the same product').toBe(fromList.in_stock);
      expect
        .soft(detail.is_location_offer, 'location-offer flag is the same product')
        .toBe(fromList.is_location_offer);
      expect.soft(detail.is_rental, 'rental flag is the same product').toBe(fromList.is_rental);
      expect(
        detail.brand,
        'the same product must be represented consistently by both endpoints',
      ).toEqual(fromList.brand);
    },
  );

  test(
    'returns not found when the product id does not exist',
    { tag: ['@regression'] },
    async ({ productsClient, noInternalDetailLeaked }) => {
      const result = await productsClient.getById(testValues.wellFormedButMissingId());

      expect(result.status, 'a well-formed id that matches nothing is a 404').toBe(404);

      const message = errorText(errorOf(result));

      expect(message, 'the 404 carries an error body').toBeDefined();
      expect(String(message).trim(), 'the error explains what went wrong').not.toBe('');
      noInternalDetailLeaked(result.rawBody);
    },
  );

  test(
    'does not repeat products when paging through the catalogue',
    { tag: ['@regression'] },
    async ({ productsClient }) => {
      const firstResult = await productsClient.listPage(1);
      expect(firstResult.status, 'listing the catalogue must succeed').toBe(200);

      const firstPage = requireValue(
        firstResult.body,
        'the pagination envelope for catalogue page 1',
      );
      const pagesToCheck = Math.min(firstPage.last_page, PAGES_TO_CHECK_FOR_DUPLICATES);
      const seenIds: string[] = [];

      for (let pageNumber = 1; pageNumber <= pagesToCheck; pageNumber += 1) {
        const result = await productsClient.listPage(pageNumber);

        expect(result.status, `page ${String(pageNumber)} must load`).toBe(200);

        const page = requireValue(
          result.body,
          `the envelope for catalogue page ${String(pageNumber)}`,
        );

        for (const productId of idsOf(page)) {
          expect(
            seenIds,
            `product ${productId} appeared on more than one page, so pagination is ` +
              'losing or duplicating rows',
          ).not.toContain(productId);
          seenIds.push(productId);
        }
      }

      expect(seenIds.length, 'the pages checked returned some products').toBeGreaterThan(0);
    },
  );

  test(
    'returns an empty page when the page is beyond the last page',
    { tag: ['@regression'] },
    async ({ productsClient }) => {
      const result = await productsClient.listPage(PAGE_BEYOND_THE_END);

      expect(result.status, 'a page beyond the end is an empty result, not an error').toBe(200);

      const page = requireValue(result.body, 'the envelope for a page beyond the last page');

      expect(isEmpty(page), 'no items are returned').toBe(true);
      // toBeNull() fails on undefined as well as on a number, so the model does not
      // need these keys to be required for this to mean what it says.
      expect(page.from, "'from' is null on an empty page").toBeNull();
      expect(page.to, "'to' is null on an empty page").toBeNull();
    },
  );

  // One loop declaring three tests, with the page number in the title — the
  // Playwright analogue of @ValueSource / [TestCase] / parametrize(ids=...), and the
  // one place a little density pays because the report clarity is worth it.
  for (const requestedPage of REQUESTED_PAGES) {
    test(
      `echoes the requested page number (page-${String(requestedPage)})`,
      { tag: ['@regression'] },
      async ({ productsClient }) => {
        const result = await productsClient.listPage(requestedPage);

        expect(result.status, `page ${String(requestedPage)} must load`).toBe(200);

        const page = requireValue(
          result.body,
          `the envelope for catalogue page ${String(requestedPage)}`,
        );

        expect(page.current_page, 'the response echoes the page number that was requested').toBe(
          requestedPage,
        );
      },
    );
  }

  test(
    'returns only matching products when searching',
    { tag: ['@regression'] },
    async ({ productsClient }) => {
      const result = await productsClient.search(SEARCH_TERM);

      expect(result.status, 'searching the catalogue must succeed').toBe(200);

      const page = requireValue(result.body, 'the envelope for a catalogue search');

      expect(isEmpty(page), 'the demo catalogue contains hammers').toBe(false);

      // A loop rather than a predicate over the whole page: the failure message names
      // the offending product instead of reporting that some predicate was false.
      for (const product of page.data) {
        expect(
          product.name.toLowerCase(),
          `search returned '${product.name}', which does not match the term '${SEARCH_TERM}'`,
        ).toContain(SEARCH_TERM.toLowerCase());
      }
    },
  );

  test(
    'returns an empty result when the search matches nothing',
    { tag: ['@regression'] },
    async ({ productsClient }) => {
      const term = testValues.uniqueName('no-such-product');

      const result = await productsClient.search(term);

      expect(result.status, 'no matches is an empty success, not a 404').toBe(200);

      const page = requireValue(result.body, 'the envelope for a search that matches nothing');

      expect(isEmpty(page), 'nothing matched').toBe(true);
      expect(page.total, 'total reflects the empty result').toBe(0);
    },
  );
});
