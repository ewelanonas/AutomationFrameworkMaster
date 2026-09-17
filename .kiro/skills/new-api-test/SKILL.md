---
name: new-api-test
description: Add an API, service, or contract test with its typed client, models, and schema validation in C#, Java, Python, or TypeScript. Covers happy path, negative paths, authorization boundaries, pagination, idempotency, and error-shape assertions. Use when asked to write or add an API test, endpoint test, service test, contract test, or HTTP client wrapper.
---

# Add an API Test

## Step 1 — Establish the contract

Before writing anything, pin down for the endpoint:

- Method, path, path/query parameters, and their constraints.
- Request body schema, required vs optional fields.
- Success status code and response body schema.
- Documented error codes and the error body shape.
- Auth requirement and the roles that may call it.
- Idempotency, pagination, sorting, rate limiting if applicable.
- Side effects: what persists, what is emitted.

Source of truth is `shared/contracts/`. If the endpoint is not there, add or
update the OpenAPI/JSON Schema first. A test written against a guessed contract
tests the guess.

## Step 2 — Model the payloads

- Typed models in `models/`: records + System.Text.Json, records + Jackson,
  Pydantic v2, or Zod.
- Contract tests forbid unknown properties (`extra="forbid"`, `strict`,
  `FailOnUnknownProperties`) so a silently added field is caught.
- Workflow tests may ignore unknown properties.
- Every response you assert on is parsed into a model. Asserting on a raw
  dict/JObject is a defect.

## Step 3 — Add or extend the client

In `clients/`:

- One method per operation, named after the operation.
- Returns status **and** parsed body. Does **not** throw on non-2xx — negative
  tests need a non-2xx to be an ordinary outcome.
- No assertions, no business logic, no retry-on-4xx.
- Uses the shared client instance with base URL, timeout, correlation id
  header, and redacted logging already configured in `support/`.
- Query and path parameters are encoded by the client, never concatenated.

## Step 4 — Write the happy path

Assert all four, not just the status:

1. Exact status code.
2. Response body: the specific promised fields, plus schema validity.
3. Contract-bearing headers (`Location` on 201, `ETag`, `Content-Type`).
4. The side effect — read it back and confirm it persisted.

Use a soft-assert block to check several fields of one response in one run, so
one failure does not hide the next.

## Step 5 — Write the negative paths

Work through this list and cover every row that applies. Missing rows are the
usual source of production defects that "passed all tests".

| Case                        | Expected                                  |
| --------------------------- | ----------------------------------------- |
| Missing required field      | 400, field named in the error             |
| Wrong type / malformed JSON | 400, not 500                              |
| Boundary values (min, max, min-1, max+1) | documented behaviour        |
| Empty string, null, whitespace, unicode, very long value | documented |
| No credentials              | 401                                       |
| Wrong role                  | 403                                       |
| Unknown id                  | 404                                       |
| **Another tenant's id**     | 404 or 403, never the other tenant's data |
| Duplicate create            | 409, or documented idempotent success     |
| Unsupported media type      | 415                                       |
| Oversized payload           | 413                                       |
| Rate limit exceeded         | 429 with `Retry-After`                    |

Also assert the error body shape, and assert it does **not** leak a stack
trace, SQL, internal hostname, or framework version.

## Step 6 — Cover the cross-cutting behaviours

Where the contract defines them:

- **Authorization boundary** — this is mandatory, not optional. Create as
  tenant A, read as tenant B, assert denial.
- **Idempotency** — repeat PUT/DELETE; POST with the same idempotency key
  creates one resource.
- **Concurrency** — stale `ETag`/version → 409 or 412.
- **Pagination** — first, middle, last, empty, beyond-end, invalid size.
  Assert no item appears on two pages and totals are consistent.
- **Eventual consistency** — poll a predicate with a timeout, and put the last
  observed state in the failure message. Never sleep-then-assert.

## Step 7 — Data and cleanup

- Builders produce valid defaults; the test overrides only the field under test.
- Unique values derive from the run id.
- Register cleanup at creation; cleanup tolerates already-deleted.
- Never assert on data the test did not create.

## Step 8 — Prove it

1. Run the new tests. All pass.
2. Run 10 times consecutively, and once at full parallelism.
3. Break one expected value, confirm the failure message shows expected vs
   actual and the redacted request/response attaches to the report, then
   restore it.
4. Confirm no `Authorization` header or token value appears anywhere in the
   report or logs.
5. Lint, format, type check.

Report what you ran. If no environment was reachable, say so plainly.

## Checklist before declaring done

- [ ] Contract sourced from `shared/contracts/`, not guessed
- [ ] Typed models; contract tests forbid unknown properties
- [ ] Client returns status + body, throws on nothing
- [ ] Happy path asserts status, body, headers, and side effect
- [ ] Negative matrix covered, including 401 vs 403 vs 404
- [ ] Cross-tenant access test present
- [ ] Error shape asserted, and no internal detail leaked
- [ ] Pagination / idempotency / concurrency covered where applicable
- [ ] Unique data, idempotent cleanup registered at creation
- [ ] No retry on 4xx, explicit timeout from config
- [ ] Secrets redacted in every log and attachment
- [ ] Tagged (`smoke` / `regression` / `contract`)
- [ ] Plain, readable code: no LINQ/stream/`reduce` chains for building or
      inspecting payloads; assert on named variables, not on inline expressions
- [ ] 10 consecutive green runs plus one parallel run
