---
inclusion: auto
name: api-and-contract-testing
description: Conventions for API, service, and contract testing — request/response design, status code and schema verification, auth handling, negative paths, pagination, idempotency, and OpenAPI/JSON Schema driven checks. Use when writing or reviewing API tests, HTTP clients, contract tests, or working with files under shared/contracts.
---

# API and Contract Testing

## Layer split

- **Client** (`clients/`): transport only. Builds the request, sends it,
  deserializes, returns a result. No assertions, no business logic, no status
  code throwing.
- **Test**: asserts status, headers, body, and side effects.
- **Flow** (`flows/`): sequences several client calls into a business action.

A client method maps to one endpoint + method. Name it after the operation:
`CreateOrderAsync`, `getOrderById`, `list_orders(page, size)`.

## What every API test asserts

For a happy path, assert all four:

1. **Status code** — the exact expected code, not "is 2xx".
2. **Body** — the specific fields the behaviour promises, plus schema validity.
3. **Headers** that carry contract meaning: `Location` on 201, `ETag`,
   `Content-Type`, cache and rate-limit headers when specified.
4. **Side effect** — read it back, or verify the downstream state. A POST that
   returns 201 but persisted nothing must fail.

## Negative paths are first-class

For each endpoint, cover deliberately:

| Case                        | Expected                                  |
| --------------------------- | ----------------------------------------- |
| Missing required field      | 400 with a field-specific error           |
| Wrong type / malformed JSON | 400, not 500                              |
| Value out of range          | 400 with the bound in the message         |
| No credentials              | 401                                       |
| Valid credentials, no right | 403                                       |
| Unknown id                  | 404                                       |
| Another tenant's id         | 404 or 403, never the other tenant's data |
| Duplicate create            | 409, or 200/201 if documented idempotent  |
| Unsupported media type      | 415                                       |
| Oversized payload           | 413                                       |
| Rate limit exceeded         | 429 with `Retry-After`                    |

Assert the **error shape** too (RFC 7807 `type`/`title`/`detail`/`errors` or
the project's documented envelope). An error body that leaks a stack trace,
SQL, or an internal hostname is a test failure — assert it does not.

## Authorization testing is mandatory

Every protected endpoint gets a test per role boundary:

- Anonymous → 401.
- Authenticated but unauthorized role → 403.
- Correct role → success.
- **Cross-tenant / horizontal access** — the most commonly missed defect.
  Create a resource as tenant A, request it as tenant B, assert denial.
- Expired and tampered tokens → 401.
- Do not test authorization only at the UI layer. Server-side is the only
  boundary that counts.

## Schema and contract verification

- `shared/contracts/` holds the OpenAPI/JSON Schema source of truth.
- Contract tests validate real responses against the schema, with
  additional-properties **forbidden**, so a silently added field is caught.
- Validate request payloads against the schema before sending in contract
  suites, so the test itself cannot drift.
- Breaking-change checks: removed field, narrowed type, new required request
  field, changed enum value, changed status code. Fail the build on these.
- Tag contract tests `contract`; they should run without a full environment
  where possible (against a mock or a running service, not a browser).

## Idempotency, concurrency, pagination

- Repeat a PUT/DELETE and assert the second call's documented behaviour.
- POST with an `Idempotency-Key` twice → one resource, same response.
- Concurrent update with a stale `ETag`/version → 409 or 412.
- Pagination: first page, middle page, last page, empty result, page beyond
  the end, invalid page size. Assert total counts and link headers are
  consistent, and that no item appears on two pages.
- Sorting and filtering: assert the ordering, not just the count.

## Correlation and diagnostics

- Every request carries a correlation id header
  (`X-Correlation-Id: af-{runId}-{seq}`), logged and attached to the report.
- On failure, attach method, URL, request headers (redacted), request body
  (redacted), status, response headers, response body, and elapsed time.
- Never attach a raw `Authorization` header. Redaction runs before attachment.

## Timeouts and retries

- Explicit timeout per client from config. No infinite waits.
- Retry only idempotent requests, only on transport errors and 5xx, max 2
  attempts, with jittered backoff. Never retry a 4xx. Never retry a POST
  without an idempotency key.
- Assert the timeout behaviour itself where it is part of the contract.

## Async and eventual consistency

- Poll with a predicate and a timeout, surfacing the last observed state in the
  failure message. Never sleep-then-assert.
- For message-driven flows, assert on the consumer's observable outcome, not on
  broker internals, unless you own the broker contract.

## Mocking policy

- Real dependency in integration suites; stub third parties in deterministic
  suites, using a recorded contract, not an invented one.
- Keep stub definitions next to the contract in `shared/contracts/` so the stub
  and the schema cannot diverge.
- A suite that stubs the system under test is not an API test. Tag it clearly.

## Anti-patterns

- Asserting only the status code.
- `assert response.ok` as the whole test.
- Sharing one auth token across all tests with no expiry handling.
- Building URLs with string concatenation and unencoded parameters.
- Snapshot-comparing an entire response body including ids and timestamps.
- Client methods that throw on non-2xx, forcing negative tests into try/catch.
- Skipping cleanup because "the API is read-only" — verify that claim.
