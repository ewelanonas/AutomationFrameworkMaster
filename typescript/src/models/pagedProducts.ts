/**
 * The pagination envelope the catalogue returns.
 *
 * Plain `z.object()`, which strips unknown keys — see `product.ts`'s header for
 * the whole rule and the six spellings it excludes.
 *
 * `from` and `to` are `.nullish()` — optional **and** nullable — and that is
 * parity rather than taste. `paged_products.py` declares
 * `from_: int | None = Field(default=None, alias="from")`, `PagedProducts.cs`
 * uses `int?`, `PagedProducts.java` uses `Integer`, and
 * `toolshop-paged-products.schema.json` lists neither in `required`. A
 * required-but-nullable field here would reject a payload the other three
 * accept. Nothing is lost on the assertion side: the empty-page case asserts
 * `toBeNull()` on the value, which fails on `undefined` just as it fails on a
 * number, so the model does not have to require the key.
 *
 * The three helpers are plain exported **functions** over the inferred type
 * rather than methods on the schema, because a Zod-inferred type is plain data.
 * `idsOf` is a deliberate rename of the shipped `ids()`: as a free function
 * taking the page as a parameter, `ids(page)` reads like a collection of ids
 * rather than an accessor. Recorded in design §17.1 row 26 beside the
 * `navigation.toPath` rename.
 */

import { z } from 'zod';

import { numberFromWireSchema, productSchema } from './product';

/**
 * One page of the catalogue.
 *
 * The four pagination integers take {@link numberFromWireSchema} for the reason
 * `product.ts`'s header gives. `from` and `to` stay `z.number().nullish()`: the
 * only values the three shipped modules and the shared schema ever see there are
 * a JSON integer or `null`.
 */
export const pagedProductsSchema = z
  .object({
    current_page: numberFromWireSchema,
    data: z.array(productSchema),
    from: z.number().nullish(),
    to: z.number().nullish(),
    last_page: numberFromWireSchema,
    per_page: numberFromWireSchema,
    total: numberFromWireSchema,
  })
  .describe('pagedProductsSchema');
export type PagedProducts = z.infer<typeof pagedProductsSchema>;

/** True when this page carries no items. */
export function isEmpty(page: PagedProducts): boolean {
  return page.data.length === 0;
}

/** Number of items on this page, 0 when the page is empty. */
export function size(page: PagedProducts): number {
  return page.data.length;
}

/**
 * The ids on this page, in order.
 *
 * A plain `for...of` loop rather than a `map`, mirroring the C#, Java and Python
 * bodies: this is read by people whose main language may not be TypeScript.
 */
export function idsOf(page: PagedProducts): string[] {
  const result: string[] = [];
  for (const product of page.data) {
    result.push(product.id);
  }

  return result;
}
