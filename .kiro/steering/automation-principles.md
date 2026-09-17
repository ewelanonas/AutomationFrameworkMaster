---
inclusion: always
---

# Automation Principles (language-neutral)

These rules apply to every module. They are the difference between a suite
people trust and a suite people ignore.

## 1. A test has one reason to fail

One scenario, one behaviour. If a test name needs "and", split it. If a
failure message cannot tell you what broke without opening the code, the test
is doing too much.

## 2. Tests are independent and order-free

- No test depends on another test having run.
- No shared mutable state between tests. Each test creates the data it needs.
- Assume tests run in a random order, in parallel, on separate machines.
- Design for parallel from the first test, not as a later migration.

## 3. Tests own their data, and clean it up

- Create data through the fastest reliable path: API or DB seed, not the UI.
- Make data unique per test run (prefix + random suffix or a run correlation
  id). Never rely on a fixed record existing.
- Clean up in teardown, and make cleanup idempotent and failure-tolerant.
- Never assert on data your test did not create.

## 4. Never sleep

Fixed sleeps are banned. There is no acceptable `Thread.Sleep`,
`time.sleep`, `await page.waitForTimeout`, or `Task.Delay` in test or page
code.

Use instead:

- Web-first assertions and auto-waiting locators (Playwright's default).
- Explicit waits on a **condition**: element state, network response, or a
  polled API predicate with a timeout and a clear failure message.
- One central timeout policy in `support/` (short for element state, medium
  for navigation, long for async workflow completion). Tests never hardcode
  a millisecond number.

## 5. Locators are stable, semantic, and centralized

Locator priority, best first:

1. Test id attribute (`data-testid`). Ask developers to add one when missing.
2. Accessible role + accessible name (`getByRole('button', { name: 'Pay' })`).
3. Label, placeholder, or associated text.
4. CSS scoped to a stable container.
5. XPath — last resort, never index-based (`div[3]`), never absolute.

All locators live in the page/component object. A raw selector string in a
test file is a defect.

## 6. Assertions live only in tests

Page objects and clients return state or typed models. They do not assert.
This keeps them reusable in negative-path tests, where the "expected" thing
is failure.

Assertion quality rules:

- Assert the specific thing, not a screenshot-shaped blob.
- Prefer one logical assertion per test; use a soft-assert block when
  verifying several fields of one object in a single act.
- Every non-obvious assertion carries a message explaining the business rule.
- Never assert on a value the test itself computed with the same code path as
  production. Use known-good literals or independent oracles.

## 7. Test the right thing at the right level

Follow the shape of the pyramid, and push tests down whenever possible:

- **Contract / API tests** for business rules, validation, permissions,
  error handling, and edge cases. Fast and stable — this is where breadth
  belongs.
- **UI tests** only for what genuinely requires a browser: critical user
  journeys, rendering, client-side behaviour, accessibility.
- Do not re-test a rule through the UI that an API test already covers.
- Smoke suite target: under 5 minutes wall clock. Full regression: under 30.

## 8. Failures must be self-diagnosing

Every failing test must produce, automatically, without anyone re-running it:

- The test name, environment, and a run correlation id.
- The last action attempted and the resolved locator or URL.
- Request/response pairs for API steps, with secrets masked.
- For UI: screenshot, DOM snapshot, video, and a Playwright trace, attached
  to the report and retained on failure only.
- Structured logs for the test, isolated from other parallel tests.

## 9. Zero tolerance for silent flake

- A retry is a diagnostic tool, not a fix. Retries are allowed in CI only
  with a maximum of 1, and every retried-then-passed test is reported as a
  flake, not a pass.
- Never wrap a flaky step in try/catch to make it green.
- Never add a conditional (`if element is visible`) to paper over a race.
  Conditional logic in a test means the expected behaviour is undefined.
- Quarantine policy and triage steps live in the flaky-test policy steering.

## 10. Configuration over hardcoding

- Base URLs, credentials refs, timeouts, and feature flags resolve through one
  config layer in `support/`, sourced from: defaults → environment file →
  environment variables (highest precedence).
- Config resolution fails fast and loud at startup with a message naming the
  missing key. Never fall back to a production URL as a default.
- No environment name branching inside a test (`if (env == "staging")`). Put
  the difference in config or skip the test with a documented reason.

## 11. Test code is production code

- Same review bar, same lint rules, same CI gates.
- No commented-out tests. Delete them or skip them with an issue link.
- No copy-paste blocks. Three occurrences means extract a helper.
- Keep methods short and named for intent. `LoginAsAdmin()` beats
  `DoStuff(1, true, "x")`.
- No `catch (Exception) {}`. No bare `except:`. Let failures fail.

## 12. Determinism

- Freeze or inject time when behaviour depends on dates. No test that only
  fails at month end.
- Seed random generators and log the seed.
- Pin browser versions, locale, timezone, and viewport in config.
- Never depend on a real third-party service in a deterministic suite; stub it
  and cover the real integration in a separate, tagged, non-gating suite.

## 13. Readability beats cleverness

Test code is read far more often than it is written, and it is read by people
who are debugging under pressure — often someone who does not know the
language well. Optimise for the reader, not for line count.

The rule: **a colleague who is new to the language should understand any test
or page object on the first read, without running it.**

Concretely, prefer the plain form:

| Avoid                                       | Prefer                                    |
| ------------------------------------------- | ----------------------------------------- |
| Chained functional pipelines (LINQ, streams, `reduce`, nested comprehensions) | A `foreach`/`for` loop with a named result variable |
| Clever one-liners                           | Three plain statements                    |
| Nested ternaries                            | `if`/`else`                               |
| Deeply nested lambdas or callbacks          | A named local method                      |
| Reflection, dynamic dispatch, generic gymnastics | Explicit, typed code               |
| Custom operator overloads or extension DSLs | Ordinary methods with clear names         |
| Regex where a simple string check works     | `Contains` / `StartsWith`                 |
| Abstraction added "for later"               | Duplication until the third occurrence    |

This is not permission to write bad code. Short methods, good names, and no
duplication still apply. The trade being made is **conciseness for clarity**,
never correctness or structure for either.

Where a functional construct genuinely is the clearest option — a single
`Where`, `filter`, or `map` on one line, doing one obvious thing — use it. The
rule targets chains and nesting, not the existence of the feature.

If a piece of logic is complex enough that the plain form is still hard to
read, that logic does not belong in a test. Move it into a well-named helper
in `support/` with a comment explaining the business rule, and keep the test
itself linear.

Framework internals in `support/` may be slightly denser than tests, because
they are written once and read rarely. Even there, favour the readable form:
the person debugging a broken fixture at 2am is not in a mood for a five-stage
pipeline.

## Anti-patterns checklist

Reject code that does any of these:

- Sleeps, or waits with no condition.
- Selector strings inside a test file.
- Assertions inside page objects or clients.
- Tests that must run in a fixed order.
- Shared user accounts mutated by parallel tests.
- Credentials, tokens, or PII in source, logs, or reports.
- `if`/`try` used to tolerate a nondeterministic UI.
- One giant "end to end" test covering ten features.
- Screenshot-diff-only assertions with no functional assertion.
- Disabled or ignored tests with no linked issue.
- Chained functional pipelines (LINQ, streams, nested comprehensions,
  `reduce`) where a plain loop would read clearly.
- Clever one-liners, nested ternaries, or reflection in place of explicit code.
