---
inclusion: auto
name: flaky-test-policy
description: Policy and triage procedure for flaky, unstable, or intermittently failing tests — root cause taxonomy, quarantine rules, retry limits, and how to prove a fix. Use when a test fails intermittently, when investigating unstable CI, when asked to fix or stabilize a flaky test, or when deciding whether to add retries.
---

# Flaky Test Policy

## The rule

A flaky test is a bug in the test suite, with the same severity as a bug in the
product. It is never "just rerun it".

Flake destroys the only thing a suite is for: a red result meaning something is
broken. Once engineers learn to re-run on red, the suite stops working as a
gate even when it is technically passing.

## Retries

- Local: `retries = 0`. Always. You need to see the flake.
- CI: maximum 1 retry, and only to gather a second trace.
- A test that fails then passes is reported as **flaky**, not as a pass. It
  counts against the suite's health metric and opens a ticket.
- Never add retries to a specific test to make it green. That is quarantine
  with extra steps and no visibility.
- Never retry at the suite or job level to mask an unstable test.

## Root cause taxonomy

Diagnose before fixing. Nearly every flake is one of these:

| Cause                     | Signature                                                | Fix                                                              |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Race / missing wait       | Fails under load or on slow CI, passes locally           | Wait on the real condition, not on time                          |
| Sleep-based timing        | `sleep`/`waitForTimeout` in the path                     | Replace with a condition or web-first assertion                  |
| Shared mutable data       | Fails only when run in parallel or with a specific subset | Per-test data with unique ids; per-worker accounts               |
| Test order dependency     | Passes alone, fails in the suite (or vice versa)          | Remove state leakage; run with a shuffled order to prove it      |
| Unstable locator          | Fails after unrelated UI changes; index-based selector    | `data-testid` or role-based locator                              |
| Animation / transition    | Fails at the moment of a modal or toast appearing         | Assert on final state; disable animations                        |
| Eventual consistency      | Fails on read-after-write                                 | Poll a predicate with a timeout, surface the last state          |
| Environment / third party | Fails in clusters at the same time of day                 | Stub the dependency; move real-integration checks to a non-gating suite |
| Time and locale           | Fails at month end, midnight, DST, or in another region   | Inject/freeze time; pin locale and timezone                      |
| Resource exhaustion       | Fails as worker count rises; timeouts everywhere at once  | Cap workers; fix leaked contexts/connections                     |
| Leaked browser state      | Fails only as the second test in a worker                 | Fresh context per test; never reuse a page                       |
| Test asserting on noise   | Fails on an unrelated console error or ad script          | Narrow the assertion; allowlist known third-party noise          |

## Triage procedure

1. **Capture evidence.** Pull the trace, video, screenshot, logs, and the
   correlation id from the failed run. Do not start by re-running.
2. **Read the failure**, not the test. What was the last action, what was the
   resolved locator or URL, what state was actually present.
3. **Classify** using the taxonomy above. Write the classification in the
   ticket. "Flaky" is not a classification.
4. **Reproduce deliberately.** Pick the matching lever:
   - Repeat the single test many times (`--repeat-each 20`,
     `dotnet test --filter` in a loop, `pytest --count 20`).
   - Run it under contention: max workers plus CPU load.
   - Run the suite in a shuffled order.
   - Throttle the network and CPU (Playwright CDP throttling).
   - Run with a different timezone and locale.
5. **Fix the cause**, then prove it: 50 consecutive green runs of that test
   under the condition that reproduced the failure. Record the evidence in
   the PR.
6. **Generalize.** If the cause is a pattern (a shared helper, a locator
   style, a missing wait idiom), fix the helper and add a lint rule or a
   steering note so it cannot come back.

## Quarantine

Quarantine is a time-boxed exception, not a parking lot.

Conditions:

- Tag the test `@quarantine` and exclude it from the gating suite, while it
  still runs in a nightly job so the data keeps accumulating.
- Every quarantined test has an owner, a ticket, and a date, recorded in the
  skip/tag reason. No owner means it gets deleted.
- Maximum 5 quarantined tests, or 1% of the suite, whichever is smaller.
  Exceeding that stops feature work on the suite until it is back under.
- 14-day limit. At expiry: fix it, rewrite it at a lower layer, or delete it.
  A quarantined test older than 14 days is deleted, and the coverage gap is
  logged as a ticket. A permanently disabled test is worse than no test — it
  looks like coverage and provides none.

## Health metrics to track per run

- Pass rate, and separately **first-attempt** pass rate.
- Flake rate: tests that passed only on retry, as a percentage.
- Top 10 tests by failure count over 30 days.
- Suite duration p50/p95 and the slowest 10 tests.
- Quarantine count and oldest quarantine age.

Target: first-attempt pass rate above 99% on a healthy trunk. Below 95%
means the suite is not a gate and should be treated as an incident.

## What is never an acceptable fix

- Adding a sleep, or increasing a sleep.
- Raising a timeout without evidence that the operation legitimately takes
  longer.
- Wrapping the step in try/catch, or in a conditional.
- Adding `if (isVisible)` branches so both outcomes pass.
- Making the assertion weaker (`toBeTruthy` instead of the real value).
- Adding a per-test retry.
- Deleting the assertion that failed.
- Marking it skipped with no ticket, owner, or date.
