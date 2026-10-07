# 0006 — a per-process tag in every generated identity

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Generated identities were formatted `af-{runId}-{n}`: the `af-` prefix a janitor
job searches for, the run id that ties a record back to the pipeline run that
created it, and a per-process counter.

In GitHub Actions run **37529901169** that format broke the suite. Both module
jobs belong to one workflow run, so both resolved the same `GITHUB_RUN_ID`, and
each process restarted its own counter at 1. The second job therefore re-minted
addresses the first job had already registered, `POST /users/register` answered
`409`, and `AccountFlow` failed in setup for every test that needed an account —
in both modules, with no code change.

Two properties were needed, and only one of them was already true:

- Unique across **threads inside** one process. Already correct: C#
  `Interlocked.Increment`, Java `AtomicInteger`, one counter per process.
- Unique across **processes that share a run id**. Nothing provided this.

Sharing the run id is not the bug. It is the feature that makes a log line, an
MDC prefix, a correlation header, an artifact directory and an orphaned record
all point at the same pipeline run. So the run id stays, and the identity gains a
discriminator.

## Decision

**Add a per-process tag, `RunContext.ProcessTag` / `RunContext.processTag()`,
minted once per process, and embed it in every generated identity and
correlation id.** The run id, its `AF_RUN_ID` → `GITHUB_RUN_ID` → random
precedence, the artifact directory and the log prefix are all unchanged.

The tag is built from two inputs in one code path:

- the CI per-job key when the environment supplies one — `GITHUB_JOB`, followed
  by `GITHUB_RUN_ATTEMPT`, lowercased and stripped to letters and digits;
- **eight hex characters of per-process randomness, always.**

```text
email           af-{runId}-{processTag}-{n}@example.invalid
  in CI         af-37529901169-csharp-1-9f3c1a7e-5@example.invalid
  locally       af-4b1e9c70-9f3c1a7e-5@example.invalid

name            {prefix}-af-{runId}-{processTag}-{n}
correlation id  af-{runId}-{processTag}-{n}
```

The CI parts are **an optimisation of the guarantee, never a prerequisite for
it.** The random part runs in every environment, so the fix works with no CI
variables at all and nothing depends on GitHub's variable names being present.

## Why this composite

| Option | Guarantee | Why not on its own |
| --- | --- | --- |
| `GITHUB_JOB` (+ `GITHUB_RUN_ATTEMPT`) alone | Unique **by construction** within one run: job keys are unique in a workflow file, and the attempt number separates a `gh run rerun`, which preserves `GITHUB_RUN_ID`. | Absent on a local run, so it cannot be the only mechanism. Does not separate two processes inside one job, or two legs of a matrix job. GitHub-specific: a team copying this module to GitLab or Jenkins inherits nothing. |
| A module-name literal (`"cs"` / `"jv"`) | By **convention** only. | Nothing enforces that the literals differ. A copied module, a renamed module, or the same module run twice in one job collides again — an invariant enforced nowhere and reviewed never. Rejected outright: it is the one option with no construction-level guarantee at all. |
| OS process id | By construction only among live processes on **one host**. | The `java` and `csharp` jobs run on separate runner VMs, so both can legitimately hold pid 1234 — `run_id` + `pid` is *not* guaranteed distinct for the two processes that actually collided. Also not reproducible, and a pid reads as noise in an address. |
| Per-process random alone | Probabilistic: 8 hex is 4 294 967 296 values; four processes on one pinned run id is roughly 1.4 × 10⁻⁹. | Strong, and the right floor, but not a construction-level guarantee in the exact case that broke CI, where one is available for free. |
| Per-value random instead of per-process | Probabilistic per address. | Removes the counter from identity, costing the readable "nth value of this process" ordering and the link between a generated value and the correlation id beside it in the log. |

The composite takes the strongest available guarantee in CI and keeps the only
mechanism that works everywhere as its floor. It is one code path — the tag is
simply longer when CI hands us a job key — so there is no never-exercised
branch.

## Lengths

Measured, not estimated. `af-37529901169-csharp-1-9f3c1a7e-5` is **34**
characters, **50** with the domain. The worst case is 3 (`af-`) + 11 (run id)
+ 1 + 12 (job key, truncated) + 1 + 2 (attempt) + 1 + 8 (random) + 1 + 3
(sequence) = **43** characters of local part against the 64-character limit, so
**59** for the full address against the 254-character address limit. The 3 for
the sequence is an assumption rather than a bound: a process minting more than
999 values adds one character per decade of extra values, which stays inside 64
well past any plausible suite size.

## Truncation caveat

`jobPart` is cut to 12 characters and `attemptPart` to 2. The construction-level
guarantee therefore holds for job keys that differ **within their first 12
alphanumeric characters** and for attempt numbers below 100; beyond that the
random part is what separates them. In this repo the job keys are `java` and
`csharp`, so the guarantee applies to the two processes that actually collided.
The separator between the parts is what keeps `job="csharp"`+`attempt="11"`
distinct from `job="csharp1"`+`attempt="1"`.

## Consequences

- **Every contract on the old format survives.** The `af-` prefix is still the
  first three characters, so the janitor contract in
  `.kiro/steering/test-data-and-secrets.md` keeps working. The run id is still
  the second segment. The domain is still `example.invalid`. The sequence is
  still last.
- **Both modules implement it identically** — same member name, same build
  rules, same format, same truncation limits — so there is no parity divergence
  to record under `product.md` criterion 5.
- **The tag is on the diagnostics surface, not only the startup line.** The
  resolved-environment line prints `runId=… processTag=…`, and the failure
  diagnostics attachment in both modules prints a `processTag:` row, because the
  duplicate-registration message tells the reader to compare the two.
- **`AccountFlow` now names the duplicate case.** A `409` throws with a message
  saying the address is already registered and pointing at the runId/processTag
  pair. It still throws: nothing is retried, tolerated, or reused, and the
  per-test-account contract is untouched.
- **No knob pins the tag.** A variable whose only purpose is to re-break identity
  uniqueness is a footgun. The regression is covered by unit-level checks in
  both modules plus the pinned-`AF_RUN_ID` repro, which is the acceptance check:
  one run id across both suites, no `409`, different tags.
- **Three documentation surfaces moved with the code** —
  `test-data-and-secrets.md`, `api-and-contract-testing.md` and the
  `test-data-builder` skill all taught `af-{runId}-{seq}`. Leaving them would
  have steering teaching the format this change removes.
- **One residual risk, stated rather than assumed away.** Nothing in this repo
  documents the demo API's email local-part limit, and nothing in
  `shared/contracts` constrains the field. 34 characters today and 43 worst case
  are far inside the RFC limit, so this is a note rather than a risk — and the
  one way the format change could surface as a new failure.
