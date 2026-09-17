---
name: review-test-code
description: Review test automation code against this repo's standards — layering, locators, waits, assertions, data isolation, secrets handling, parallel safety, and reporting. Produces findings grouped by severity with concrete fixes. Use when asked to review a test, a page object, an API client, a PR, or to audit an existing automation suite for quality.
---

# Review Test Automation Code

## How to review

Read the code before commenting on it. Group findings by severity, name the
file and line, explain the consequence, and give the concrete fix. A review
that lists rule names without consequences does not change behaviour.

Order findings by severity, not by file. Lead with the blockers.

## Severity definitions

- **Blocker** — will leak a secret, produce false confidence, or destabilise the
  suite for everyone. Must be fixed before merge.
- **Major** — will cause flake, hide defects, or make failures untriageable.
  Fix before merge unless there is a tracked follow-up.
- **Minor** — maintainability and consistency. Fix now if cheap.
- **Note** — an observation or an option, no action required.

## Blockers

- Any credential, token, connection string, key, or cookie value in source,
  config, fixture, or test data.
- A secret, token, or unmasked PII reachable in a log, report attachment, HAR,
  or trace that gets uploaded.
- A test that cannot fail: no assertion, `assert True`, an assertion on a value
  the test itself produced, or a swallowed exception around the act.
- A test pointed at production, or a config that defaults to a production URL.
- Authorization tested only through the UI, with no server-side boundary test.
- `try/catch` or a conditional wrapping the act or the assertion so both
  outcomes pass.
- Destructive setup that could affect data the suite does not own.

## Major

**Waits and timing**
- Any `Thread.Sleep`, `Task.Delay`, `time.sleep`, `page.waitForTimeout`.
- A wait with no condition, or `waitForLoadState('networkidle')` as a general
  wait.
- Hardcoded millisecond literals instead of the central timeout policy.
- Missing `await` on a Playwright call (TS) — the top flake source in that stack.

**Layering**
- Selector strings in a test file.
- Assertions inside a page object or client.
- A client that throws on non-2xx, forcing negative tests into try/catch.
- `tests/` imported by `support/`, or any upward dependency.
- Business logic in `support/` that belongs in `flows/`.

**Locators**
- Index-based (`div[3]`, `nth-child(4)`), absolute XPath, generated class names,
  or framework hashes.
- Recorder output committed unedited.
- Two page objects owning the same element.

**Isolation and parallel safety**
- Shared mutable state: static/module-level fields holding a page, driver,
  client, or data.
- Tests that depend on execution order, or `@Order`/`describe.serial` used to
  create dependencies.
- A fixed record id assumed to exist in the environment.
- One account mutated by concurrent workers.
- Data created with no cleanup, or cleanup registered after the act so a
  mid-test failure orphans it.
- Non-idempotent cleanup that fails on an already-deleted record.

**Assertions**
- Status-code-only assertions on an API response.
- Asserting on an unvalidated dict/JObject instead of a typed model.
- A whole-response snapshot including ids and timestamps.
- Screenshot diff with no functional assertion.
- No message on a non-obvious assertion.
- Several unrelated assertions in one test (should be several tests).

**Diagnostics**
- No failure artifacts: no screenshot, trace, HTML, or request/response capture.
- Test names that mean nothing in a report (`test_1`, `TestLogin2`).
- `print` / `console.log` / `System.out.println` / `Console.WriteLine` instead
  of the logger.
- No requirement or ticket link.

**Level**
- A validation matrix or permission check driven through the browser when an API
  test would cover it.
- A single test walking many features with many assertions.

## Minor

- Missing tag, so the test lands in no suite or the wrong one.
- Copy-pasted block appearing three or more times.
- Naming that does not follow the module convention.
- Page object inheritance more than one level deep.
- A `Valid()` builder default duplicated inline in the test.
- Commented-out code, or a skip with no ticket.
- Formatter or linter violations.
- `any` / `dynamic` / `Object` where a type exists.

**Readability (flag these as Minor, or Major if they obscure the logic)**
- LINQ chains in C#, `Stream` chains in Java, nested comprehensions in Python,
  or `filter().map().reduce()` chains in TypeScript. A `foreach` / `for` loop
  with a named result variable is the house style.
- `reduce` / `Aggregate` anywhere in test code.
- `Optional` chains used as control flow instead of a plain null check.
- Nested ternaries, or a ternary inside a template literal or interpolation.
- Optional-chaining trains (`a?.b?.c?.d`) hiding a missing guard.
- A lambda longer than one statement, or a nested lambda.
- Reflection, `dynamic`, metaclasses, decorators with hidden control flow, or
  annotation-generated code where explicit code would do.
- Type-level cleverness (conditional/mapped types, deep generics) outside
  `support/`.
- A one-liner that would be three obvious statements.
- A LINQ/stream expression inside an assertion, so the failure message shows a
  computed blob instead of a named value.

When flagging these, say what the plain form is, do not just name the rule. The
standard to apply: **could a colleague whose main language is a different one
read this correctly on the first pass?**

## Output format

```text
## Blockers
1. typescript/tests/ui/login.spec.ts:14 — hardcoded password `Winter2026!`.
   This lands in git history and in the Allure attachment for every run.
   Fix: read it from `config.auth.password`, sourced from `AF_AUTH_PASSWORD`,
   and add the key to `.env.example`.

## Major
2. python/src/framework/pages/checkout.py:47 — `time.sleep(3)` before reading
   the total. This is the cause of the intermittent failure in CI, and it also
   adds 3s to every run. Fix: `expect(self.total).to_have_text(expected)`.

## Minor
...

## Notes
...

## Verified
- Ran `pnpm --dir typescript lint` — clean.
- Ran the affected spec 10x — 10 passes.
```

Close with what you actually verified by running, and what you could not
verify and why. Do not imply you ran a suite you did not run.

## What a good review also does

- Point out the missing test, not just the flawed one. Absent negative paths,
  absent cross-tenant checks, and absent cleanup are the most expensive gaps.
- Recognise when a pattern problem needs a helper, a lint rule, or a steering
  update instead of the same comment on twelve files.
- Say when the code is fine. A review with no positive signal teaches nothing
  about what to repeat.
