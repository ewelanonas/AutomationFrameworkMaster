/**
 * Contract verification against the schemas in `shared/contracts/`.
 *
 * These are the tests that catch drift. The schemas set
 * `additionalProperties: false`, so a field the service quietly adds, removes or
 * renames fails here — which is the entire point. A failure in this file is not
 * necessarily a defect: it is a change nobody told the test suite about, and the
 * correct response is to find out which, then update the schema **deliberately**
 * rather than loosening it to make the test pass.
 *
 * The same four schemas are validated by the C#, Java and Python modules with three
 * different validators. Agreeing on the schema rather than on a library is what
 * makes the contract shared rather than duplicated.
 *
 * Every case validates **raw response text**, never a parsed model: the models
 * strip unknown keys by design, so validating a parsed object would validate away
 * the very drift this suite exists to find.
 *
 * No new schema file is needed and `shared/contracts/` is not modified.
 */

import { requireValue } from '@support/require';
import { test, expect } from '@support/fixtures';
import { validate } from '@support/schemaValidation';
import * as testValues from '@support/testValues';

const DECIDE_WHICH =
  'Either the API changed or the schema is stale — decide which, then update the ' +
  'schema deliberately rather than loosening it to make this pass.';

test.describe('Toolshop contract', () => {
  test(
    'the product list matches the paged-products schema',
    { tag: ['@contract'] },
    async ({ productsClient }) => {
      const result = await productsClient.listPage(1);
      expect(result.status, 'listing the catalogue must succeed').toBe(200);

      const violations = validate('toolshop-paged-products.schema.json', result.rawBody);

      expect(
        violations,
        'the product list no longer matches ' +
          `shared/contracts/toolshop-paged-products.schema.json. ${DECIDE_WHICH}`,
      ).toEqual([]);
    },
  );

  test(
    'a single product matches the product schema',
    { tag: ['@contract'] },
    async ({ productsClient }) => {
      const listing = await productsClient.listPage(1);
      expect(listing.status, 'listing the catalogue must succeed').toBe(200);

      const page = requireValue(listing.body, 'the pagination envelope for catalogue page 1');
      const first = requireValue(page.data[0], 'the first product on catalogue page 1');

      const result = await productsClient.getById(first.id);
      expect(result.status, 'a product that the listing showed must be fetchable').toBe(200);

      const violations = validate('toolshop-product.schema.json', result.rawBody);

      expect(
        violations,
        'the product representation drifted from ' +
          `shared/contracts/toolshop-product.schema.json. ${DECIDE_WHICH}`,
      ).toEqual([]);
    },
  );

  test(
    'every product on page 1 matches the product schema',
    { tag: ['@contract'] },
    async ({ productsClient }) => {
      // Checking only the first item is the usual shortcut, and it misses the case where
      // one product has a null field the others populate.
      const result = await productsClient.listPage(1);
      expect(result.status, 'listing the catalogue must succeed').toBe(200);

      const page = requireValue(result.body, 'the pagination envelope for catalogue page 1');

      for (const product of page.data) {
        const single = await productsClient.getById(product.id);

        const violations = validate('toolshop-product.schema.json', single.rawBody);

        expect(
          violations,
          `product ${product.id} ('${product.name}') does not match ` +
            `shared/contracts/toolshop-product.schema.json. ${DECIDE_WHICH}`,
        ).toEqual([]);
      }
    },
  );

  test(
    'the login response matches the login-response schema',
    { tag: ['@contract'] },
    async ({ authClient, disposableAccount }) => {
      const result = await authClient.loginWith(
        disposableAccount.email,
        disposableAccount.password,
      );
      expect(result.status, 'the account this test created must be able to sign in').toBe(200);

      const violations = validate('toolshop-login-response.schema.json', result.rawBody);

      expect(
        violations,
        'the login response drifted from ' +
          `shared/contracts/toolshop-login-response.schema.json. ${DECIDE_WHICH}`,
      ).toEqual([]);
    },
  );

  test(
    'a not-found error body matches the error schema',
    { tag: ['@contract'] },
    async ({ productsClient }) => {
      const result = await productsClient.getById(testValues.wellFormedButMissingId());
      expect(result.status, 'a well-formed id that matches nothing is a 404').toBe(404);

      const violations = validate('toolshop-error.schema.json', result.rawBody);

      expect(
        violations,
        'the 404 body does not match shared/contracts/toolshop-error.schema.json. The ' +
          "schema requires exactly one of 'message' or 'error' — the demo API uses " +
          'different fields on different endpoints, which is recorded in ' +
          `shared/contracts/README.md. ${DECIDE_WHICH}`,
      ).toEqual([]);
    },
  );

  test(
    'an unauthorized error body matches the error schema',
    { tag: ['@contract'] },
    async ({ authClient }) => {
      const result = await authClient.currentUser();
      expect(result.status, 'anonymous access to a protected endpoint must be 401').toBe(401);

      const violations = validate('toolshop-error.schema.json', result.rawBody);

      expect(
        violations,
        'the 401 body does not match shared/contracts/toolshop-error.schema.json. ' + DECIDE_WHICH,
      ).toEqual([]);
    },
  );
});
