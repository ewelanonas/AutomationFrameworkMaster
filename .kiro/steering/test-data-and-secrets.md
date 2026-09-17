---
inclusion: always
---

# Test Data, Configuration, and Secrets

## Secrets: hard rules

1. **Never** write a real credential, token, connection string, API key,
   certificate, or cookie value into any file in this repo. Not in source,
   not in a config file, not in a comment, not in a test fixture, not in a
   commit message.
2. Placeholders in docs and examples use the obvious form:
   `YOUR_API_KEY_HERE`, `<tenant-id>`, `changeme`. Never a realistic-looking
   fake that someone might mistake for a live value.
3. Secrets reach the suite only through **environment variables** injected by
   the CI secret store or a local `.env` file that is gitignored.
4. Commit `.env.example` listing every required variable with an empty or
   placeholder value and a one-line comment. Config loading validates against
   this list at startup.
5. `.gitignore` must cover: `.env`, `.env.*` (except `.env.example`),
   `*.pfx`, `*.p12`, `*.pem`, `*.key`, `secrets.json`,
   `appsettings.Local.json`, `local.settings.json`.
6. Prefer short-lived, scoped credentials: OIDC federation in CI, workload
   identity, or a token minted per run. Long-lived static keys are a last
   resort and must be documented with an owner and rotation cadence.
7. Test accounts get the minimum permissions their suite needs. No shared
   admin account across suites.

## Masking in logs and reports

- Log and report writers run every payload through a redaction step before
  output. Redact by key name (`password`, `token`, `authorization`, `secret`,
  `apikey`, `ssn`, `card`, `cvv`, `pin`, `email`, `phone`) and by pattern
  (bearer tokens, JWTs, PAN-shaped digit runs).
- Redact to a fixed marker `***REDACTED***`. Never partially reveal, and never
  log the length of a secret.
- Allure/HTML attachments go through the same redaction as console logs.
  Traces, videos, and HAR files can capture headers — scrub HARs before
  upload or do not upload them.
- Never log a full request header block verbatim.

## Configuration precedence

Resolution order, lowest to highest:

1. Built-in defaults in code (safe, non-production, `local` only).
2. `shared/environments/<env>.json` — non-secret: base URLs, timeouts,
   feature flags, retry counts, browser settings.
3. Module-local config file for language-specific knobs.
4. Environment variables — always win. Naming: `AF_<AREA>_<KEY>`, e.g.
   `AF_API_BASEURL`, `AF_UI_BASEURL`, `AF_AUTH_CLIENTSECRET`.

Rules:

- Fail fast at startup with a message naming every missing required key.
- Never default a base URL to production.
- The selected environment name is logged and attached to every report.
- A test never reads an environment variable directly; it reads typed config
  from `support/`.

## Test data strategy

Preference order for getting a test into the state it needs:

1. **Build it in-memory** (pure unit-ish checks, request payloads).
2. **Create it via API** — the default for UI tests. Fast and reliable.
3. **Seed it via database or a seeding endpoint** when no API exists.
4. **Create it through the UI** only when creation itself is the thing under
   test.
5. **Pre-existing reference data** only for genuinely static lookups
   (countries, currencies), never for mutable records.

## Builders, not fixtures-with-magic-numbers

Every model gets a builder that produces a **valid** object by default, with
overrides for the one field the test cares about. This makes the intent of a
test visible: the only values written in the test are the values that matter.

```text
CustomerBuilder.Valid().WithExpiredCard().Build()
customer_builder().with_country("PH").build()
```

Rules:

- Defaults are always valid, always unique where uniqueness matters.
- Randomness comes from a seeded faker. The seed is logged and reproducible
  via an environment variable.
- Never randomize a value the assertion depends on unless the assertion is
  derived from the same builder output.
- Builders are immutable/fluent, returning a new instance per `With...` call.

## Accounts are data, and data is per test

A shared login is shared mutable state, even when no test writes to the account
directly. Servers keep counters and flags against an identity: failed-attempt
counts, lockouts, rate limits, sessions, MFA state, "must change password".

Any test that authenticates negatively — a wrong password, a tampered token, an
expired session — moves that hidden state. Do it enough times to a shared account
and the account locks, at which point **every** test that signs in fails,
including all the happy paths.

This is not hypothetical. It happened here: the negative sign-in tests locked the
demo customer account, and the API began answering `423 Locked` to every login
across **two** language modules at once. The suites went from green to almost
entirely red with no code change.

Rules:

- **Register a fresh account per test** for anything that authenticates. Creation
  over the API costs a few hundred milliseconds and buys complete isolation.
- A test that deliberately fails a login **must** own the account it abuses.
- Fixed accounts from config are acceptable only for read-only scenarios, and
  even then prefer a created one.
- A test that locks, suspends, or otherwise burns an account is fine, provided the
  account is disposable. Tag it so it is visible.
- Where creation is impossible, allocate one account **per parallel worker** and
  never share across workers.
- Prefer asserting the lockout deliberately rather than discovering it. Behaviour
  a suite can break itself on is behaviour worth a test.

## Uniqueness and correlation

- Every run generates a **run id** (short uuid or CI build number). Include it
  in generated names and emails: `af-{runId}-{n}@example.invalid`.
- Use reserved test domains for emails: `example.com`, `example.invalid`, or
  `test.invalid`. Never a real domain.
- Phone numbers: use documented reserved ranges, never a real number.
- Never use real customer data, production dumps, or real PII. If a realistic
  dataset is needed, generate it or use a documented anonymized dataset with a
  recorded provenance note.

## Cleanup

- Register cleanup at creation time so it runs even when the test fails
  mid-way (fixture teardown, `IAsyncDisposable`, `addFinalizer`,
  `test.afterEach`).
- Cleanup is idempotent: deleting an already-deleted record is a success.
- Cleanup failures log a warning with the orphan's id, and do not fail the
  test that already passed. Emit them to a report section so orphans get
  noticed.
- A scheduled janitor job cleans anything matching the `af-` prefix older than
  24 hours. Do not rely on it as primary cleanup.

## Shared test data files

- Language-neutral payloads live in `shared/testdata/` as JSON with a
  matching JSON Schema in `shared/contracts/`.
- Each module loads them through a typed loader in `support/`, validating
  against the schema on load. A schema mismatch fails fast.
- Never fork a shared payload into a module. Extend it or add a variant file.
