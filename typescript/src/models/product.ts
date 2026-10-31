/**
 * Catalogue shapes: product, category, brand, image and specification row.
 *
 * UNKNOWN MEMBERS: PLAIN `z.object()`, AND NOTHING ELSE
 * -----------------------------------------------------
 * Every schema in this module is a **plain `z.object()`**, which *strips*
 * unknown keys. That is the behaviour all three shipped modules already have —
 * `System.Text.Json`'s default in C#, `@JsonIgnoreProperties(ignoreUnknown = true)`
 * in Java, `ConfigDict(extra="ignore")` in Python — so the day the demo target
 * adds a field, all four modules keep passing and the contract suite reports the
 * drift once, from a definition all four read.
 *
 * So, spelled out because a passthrough modifier is what someone will reach for
 * after reading the brief, here are the six Zod spellings this module forbids,
 * named without their punctuation so the verification grep that hunts for them
 * does not match this sentence: **passthrough, strict, strictObject, looseObject,
 * catchall, and the whole coerce family.** They are Zod 4's spellings for the two
 * behaviours this rule excludes, and all six are grepped in the module's final
 * verification. The passthrough and loose-object forms *keep* unknown keys, which
 * is Pydantic's `extra="allow"` — a fourth behaviour none of the shipped modules
 * has. A strict schema would redden TypeScript against three green modules, which
 * is the exact asymmetry parity exists to prevent.
 *
 * The strictness that matters lives in `shared/contracts/`, which sets
 * `additionalProperties: false` at the root and in every nested object. That is
 * one definition, four modules, and it is the contract suite's job rather than
 * the model layer's.
 *
 * WIRE NAMES STAY WIRE NAMES
 * --------------------------
 * Fields keep the API's snake_case (`is_location_offer`, `product_image`,
 * `co2_rating`). There is no alias layer and no camelCase mapping: there is
 * nothing to map *to*, a mapping layer is a second place drift can hide, and a
 * reader comparing a failure message against `shared/contracts/` sees the same
 * names in both. Everything this module writes itself is camelCase.
 *
 * Two Python workarounds vanish here and are named so nobody ports them: `from`
 * needs no alias (it is a legal property name in JavaScript) and `dob` needs no
 * serialization alias.
 *
 * THE ONE NAMED STRING-OR-NUMBER UNION
 * ------------------------------------
 * {@link numberFromWireSchema} is declared **once, here**, and imported by
 * `pagedProducts.ts` and `auth.ts`. It is never inline-repeated: six fields
 * across three files share one definition, so a change reaches all six.
 *
 * Why it exists at all: `csharp/src/AutomationFramework.Core/Support/ApiHttp.cs`
 * sets `NumberHandling = JsonNumberHandling.AllowReadingFromString`, and
 * `python/src/framework/models/product.py` documents Pydantic's lax coercion of
 * `"12.50"` into a `Decimal`. So C#, Java and Python all accept a number the API
 * encoded as a string. A bare `z.number()` here would make TypeScript the one
 * module of four that rejects a payload the other three accept.
 *
 * Why **not** Zod's coercing number schema, which looks like the shorter
 * spelling of the same idea: coercion runs `Number(value)` on *anything*, so it
 * also swallows `null` (0), `true` (1), `''` (0) and `[]` (0). That is strictly
 * looser than the three shipped modules, not equal to them. An earlier revision
 * of this design banned the coerce family on a parity ground; **that reason was
 * wrong and this is the right one.** The explicit regex union accepts exactly a
 * decimal literal in a string and nothing else.
 */

import { z } from 'zod';

/**
 * A number, or a string holding a plain decimal literal.
 *
 * Declared once and reused for `product.price`, the numeric arm of
 * `productSpec.spec_value`, the four `pagedProducts` integers and
 * `loginResponse.expires_in`. See the file header for the rationale and for why
 * Zod's coercing schemas are not used.
 */
export const numberFromWireSchema = z.union([
  z.number(),
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
]);

/**
 * A product category.
 *
 * `slug` is absent from `GET /products/search`, which expands the category as
 * `{id, name}` only; `parent_id` appears only on `GET /products/{id}`. Both are
 * observed behaviour rather than a weakening — `toolshop-product.schema.json`
 * still *requires* `category.slug` for the two endpoints the contract suite
 * validates.
 */
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullish(),
  parent_id: z.string().nullish(),
});
export type Category = z.infer<typeof categorySchema>;

/** A product brand. */
export const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullish(),
});
export type Brand = z.infer<typeof brandSchema>;

/** Image metadata attached to a product, including its attribution. */
export const productImageSchema = z.object({
  id: z.string(),
  file_name: z.string(),
  title: z.string().nullish(),
  by_name: z.string().nullish(),
  by_url: z.string().nullish(),
  source_name: z.string().nullish(),
  source_url: z.string().nullish(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

/**
 * One specification row on a product, for example `Weight = 340 g`.
 *
 * The whole array is returned only by `GET /products/{id}`.
 *
 * `spec_value` is a string **or** a number because the API genuinely sends
 * either — `"Bi-component"` on one row and `200` on the next. The numeric arm is
 * {@link numberFromWireSchema}, the same union `price` uses. C# needs a
 * `ValueAsText()` helper because it models the field as an untyped
 * `JsonElement`; the union is already readable, nothing asserts on it
 * numerically, and no helper is ported.
 */
export const productSpecSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  spec_name: z.string(),
  spec_value: z.union([z.string(), numberFromWireSchema]).nullish(),
  spec_unit: z.string().nullish(),
});
export type ProductSpec = z.infer<typeof productSpecSchema>;

/**
 * A product in the catalogue.
 *
 * The required set — `id`, `name`, `price` — is what both the list and the
 * detail endpoint always send. Everything else is `.nullish()` (null **or**
 * absent), mirroring Python's `| None = None` exactly, because the API omits
 * different fields on different endpoints: `specs` appears only on
 * `GET /products/{id}`, and the search endpoint trims the expansions.
 *
 * `price` is a plain `number`. TypeScript has no decimal type and adding
 * `decimal.js` for one assertion is not justified; the UI comparison uses
 * `price.toFixed(2)`, which is the direct analogue of Python's
 * `quantize(Decimal('0.01'))`.
 *
 * The description is what `resultOf` names in a parse-failure message.
 */
export const productSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    price: numberFromWireSchema,
    in_stock: z.boolean().nullish(),
    is_location_offer: z.boolean().nullish(),
    is_rental: z.boolean().nullish(),
    is_eco_friendly: z.boolean().nullish(),
    co2_rating: z.string().nullish(),
    category: categorySchema.nullish(),
    brand: brandSchema.nullish(),
    product_image: productImageSchema.nullish(),
    specs: z.array(productSpecSchema).nullish(),
  })
  .describe('productSchema');
export type Product = z.infer<typeof productSchema>;
