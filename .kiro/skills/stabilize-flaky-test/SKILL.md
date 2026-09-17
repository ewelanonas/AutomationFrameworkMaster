---
name: stabilize-flaky-test
description: Diagnose and fix a flaky, intermittently failing, or timing-dependent test by classifying the root cause, reproducing it deliberately, fixing the cause rather than the symptom, and proving stability with repeated runs. Use when a test passes sometimes and fails other times, when CI is unstable, or when asked to fix, stabilize, or de-flake a test.
---

# Stabilize a Flaky Test

## Ground rule

Do not fix the symptom. Adding a sleep, raising a timeout, adding a retry, or
wrapping the step in try/catch is not a fix — it hides the defect and makes the
suite less trustworthy than deleting the test would.

Diagnose, reproduce, fix the cause, prove it.

## Step 1 — Gather evidence, do not re-run yet

Collect before touching code:

- The Playwright trace, screenshot, video, and page HTML from the failed run.
- Logs for that test, filtered by its correlation id.
- The request/response pairs for the API calls in the path.
- How often it fails, and **when**: only in CI, only in parallel, only at a
  certain time, only after a specific other test, only on one shard.
- What changed recently in the app, the suite, and the environment.

The failure pattern usually identifies the cause before you read the test.

## Step 2 — Classify the cause

Pick one. "Flaky" is not a classification.

| Signature                                                    | Likely cause               |
| ------------------------------------------------------------ | -------------------------- |
| Passes locally, fails on slow/loaded CI                      | Race, missing wait         |
| A `sleep` / `waitForTimeout` exists in the path              | Timing-based wait          |
| Fails only when parallel, or only with a specific subset      | Shared mutable data        |
| Passes alone, fails in the suite (or the reverse)             | Test order dependency      |
| Started failing after unrelated UI work                       | Unstable locator           |
| Fails right as a modal/toast/animation appears                | Animation/transition race  |
| Fails on read-after-write                                     | Eventual consistency       |
| Fails in clusters, several tests at once, same timestamp      | Environment or third party |
| Fails at month end, midnight, DST, or in another region       | Time/locale dependency     |
| Everything times out as worker count grows                    | Resource exhaustion        |
| Fails only as the second+ test in a worker                    | Leaked browser/page state  |
| Fails on an unrelated console error or analytics script       | Assertion on noise         |

## Step 3 — Reproduce deliberately

Match the lever to the classification. You must be able to make it fail on
demand, otherwise you cannot prove a fix.

```powershell
# TypeScript: repeat, and repeat under contention
pnpm --dir typescript exec playwright test tests/ui/checkout.spec.ts --repeat-each 20 --workers 1
pnpm --dir typescript exec playwright test --grep @checkout --repeat-each 10 --workers 8

# Python: repeat, and shuffle order to expose dependencies
uv run --directory python pytest tests/ui/test_checkout.py --count 20
uv run --directory python pytest -p no:randomly tests -n 8

# Java
mvn -f java/pom.xml test -Dtest=CheckoutTest -Dsurefire.rerunFailingTestsCount=0

# C#
1..20 | ForEach-Object { dotnet test csharp/AutomationFramework.sln --no-build --filter "FullyQualifiedName~CheckoutTests" }
```

Other levers:

- CPU/network throttling via CDP for race conditions.
- `TZ=Pacific/Kiritimati` and a non-en locale for time/locale bugs.
- Run the suspected predecessor test immediately before the target.
- Max workers plus an artificial CPU load for resource exhaustion.

Record which lever reproduced it. That is the condition your proof must run
under.

## Step 4 — Fix the cause

| Cause                 | Fix                                                                 |
| --------------------- | ------------------------------------------------------------------- |
| Race / missing wait   | Wait on the real condition: element state, matched network response, or a polled predicate. Prefer web-first assertions. |
| Sleep                 | Delete it and replace with a condition. Never raise it.             |
| Shared data           | Per-test data with run-scoped unique values; per-worker accounts.    |
| Order dependency      | Remove the leaked state; make each test create its own precondition. |
| Unstable locator      | `data-testid`, or role + accessible name. Never index-based.         |
| Animation             | Assert final state; disable animations where supported.              |
| Eventual consistency  | `expect.poll` / polled predicate with a timeout, surfacing last state. |
| Environment           | Stub the third party; move real-integration checks to a non-gating nightly suite. |
| Time/locale           | Inject or freeze time; pin locale and timezone in config.            |
| Resource exhaustion   | Cap workers; fix leaked contexts, clients, or connections.           |
| Leaked browser state  | Fresh context per test; never reuse a page across tests.             |
| Noise assertion       | Narrow the assertion; allowlist known third-party console noise.     |

If the root cause is a shared helper, fix the helper — not just this test — and
add a lint rule or a steering note so the pattern cannot return.

## Step 5 — Prove it

- 50 consecutive green runs of the test **under the condition that reproduced
  the failure**, not under easy conditions.
- One full-suite run at CI parallelism.
- Paste the evidence (command + result counts) in the PR description.
- If the original failure was CI-only, the proof must run in CI.

## Step 6 — Quarantine only if you cannot fix it now

Quarantine is a time-boxed exception with an owner, not a parking lot.

- Tag `@quarantine` / `Category=Quarantine` / `-m quarantine`, excluded from
  gating suites but still running nightly.
- Record owner, ticket, and date in the skip/tag reason.
- 14-day limit. At expiry: fix, rewrite at a lower layer, or delete and log the
  coverage gap. A permanently disabled test looks like coverage and provides
  none.
- Max 5 quarantined tests or 1% of the suite, whichever is smaller.

## Never do this

- Add or increase a sleep.
- Raise a timeout without evidence the operation legitimately got slower.
- Add a per-test retry.
- Wrap the step in try/catch, or add `if (isVisible)` so both outcomes pass.
- Weaken the assertion (`toBeTruthy` instead of the real value).
- Delete the assertion that failed.
- Use `force: true` to click past whatever was in the way.
- Mark it skipped with no owner, ticket, or date.
- Close the ticket with "could not reproduce" after one re-run.
