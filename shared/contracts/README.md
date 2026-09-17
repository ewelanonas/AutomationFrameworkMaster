# Contracts

The source of truth for API shapes. Contract tests validate real responses
against these schemas with `additionalProperties: false`, so a silently added
or removed field fails the build instead of drifting unnoticed.

## Provenance

These schemas were **derived from live responses**, not from a published spec.
Every field and status code below was observed directly against
`https://api.practicesoftwaretesting.com` on 2026-09-17.

That matters: a schema written from a guess tests the guess. If the demo API
changes, the contract tests are meant to fail — that is the signal, not a bug
in the tests.

## Files

| File | Covers |
| --- | --- |
| `toolshop-product.schema.json` | A single product object |
| `toolshop-paged-products.schema.json` | The pagination envelope around products |
| `toolshop-login-response.schema.json` | `POST /users/login` success body |
| `toolshop-error.schema.json` | Error bodies, both observed variants |

## Observed behaviour worth knowing

The demo API's **error envelope is inconsistent**, and the schemas reflect
reality rather than tidying it up:

| Request | Status | Body |
| --- | --- | --- |
| `GET /users/me` with no token | 401 | `{"message": "Unauthorized"}` |
| `GET /products/{unknown-id}` | 404 | `{"message": "Requested item not found"}` |
| `POST /users/login`, wrong password | 401 | `{"error": "Unauthorized"}` |
| `POST /users/login`, missing password | 401 | `{"error": "Invalid login request"}` |

Two things a real project should take from this:

1. Some endpoints use `message`, others use `error`. `toolshop-error.schema.json`
   therefore accepts either but requires **exactly one** of them, so a response
   carrying both — or neither — still fails.
2. A missing required field returns **401**, not the 422 you would expect from a
   validation error. Assert what the API does, then raise the inconsistency
   with the API owners. Do not write the test against the behaviour you wish
   for.

Product ids are **ULIDs** (26-character Crockford base32), not UUIDs or
integers. The schema enforces that, which catches a whole class of bad test
data early.

### The detail response is not the list response

`GET /products/{id}` returns everything a list item has, **plus**:

| Extra on the detail response | Shape |
| --- | --- |
| `specs` | array of `{id, product_id, spec_name, spec_value, spec_unit}` |
| `category.parent_id` | ULID, or null for a top-level category |

`GET /products` omits both.

`toolshop-product.schema.json` therefore marks both as optional rather than
required, so one schema covers both representations. The alternative — two
schemas — duplicates every other field and guarantees they drift apart.

This is worth reading as a worked example. The first version of this schema was
derived from the list response alone, so it knew about neither field. The
contract test against `GET /products/{id}` failed twice on
`additionalProperties: false`, naming the exact property each time:

```text
/category: property 'parent_id' is not defined in the schema
           and the schema does not allow additional properties
```

The schema was wrong, not the test — and the failure message said precisely
where. That is the whole return on setting `additionalProperties: false` and on
validating the detail endpoint separately from the list, rather than assuming
one representation stands in for the other.

### Accounts lock after repeated failed logins

`POST /users/login` returns **`423 Locked`** once an account has accumulated
enough failed attempts, and it stays locked for the correct password too:

```json
{"error":"Account locked, too many failed attempts. Please contact the administrator."}
```

This is worth knowing before writing a negative auth test. Sending wrong
passwords to a shared account locked the demo customer out from under both the
Java and C# suites at once, turning every sign-in test red.

Both modules now register a disposable account per test via
`POST /users/register` (201, and the account can sign in immediately). See the
"Accounts are data" section in `.kiro/steering/test-data-and-secrets.md`.

### The demo data is reseeded periodically

Product ids are **not stable**. A set of ids captured one hour was returning
404 the next.

Tests must therefore fetch an id from the catalogue and use that, never
hardcode one. Every test here does, which is why the reseed showed up as a
schema gap rather than as a wall of 404s.
