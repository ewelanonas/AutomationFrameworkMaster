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
