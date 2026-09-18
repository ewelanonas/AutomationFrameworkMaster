# 0004 — CI gates on smoke, and one workflow serves every branch

- **Status:** Accepted. Partly superseded by
  [ADR 0005](0005-master-carries-every-module.md).
- **Date:** 2026-09-17
- **Applies to:** `.github/workflows/ci.yml`

> **Note added 2026-09-17.** The branch layout described below changed the same
> day: `master` now carries every module, so both module jobs run on it. The
> smoke-on-pull-request and regression-nightly decision, which is what this ADR is
> actually about, is unchanged. The `detect` job also survived untouched — it looks
> for module directories rather than mapping branches to modules, which is the part
> of this design that earned its keep. The branch-layout text is left as written
> rather than edited, because an ADR records what was decided at the time.

## Context

Two constraints shaped the pipeline, and neither is the usual one.

**The language modules live on different branches.** `java/` exists only on
`framework/java`, `csharp/` only on `framework/csharp`, and neither exists on
`main`. A workflow that assumes a module is present cannot work.

**The target is a free public sandbox.** Both suites run against
`practicesoftwaretesting.com`, which is shared with everyone else learning test
automation. Load is not a theoretical concern: at four parallel workers the C#
suite drew `ERR_CONNECTION_RESET`, SSL handshake failures and navigation
timeouts — five failures caused entirely by our own traffic. At two workers the
same suite went green and ran three times faster.

## Decision

**One workflow file on `main`, merged down**, with a `detect` job that looks for
each module and gates the module jobs on what it finds:

| Branch | Jobs that run |
| --- | --- |
| `main` | `standards` |
| `framework/java` | `standards`, `java` |
| `framework/csharp` | `standards`, `csharp` |

**Smoke on every push and pull request. Regression nightly.** Full runs are
available on demand through `workflow_dispatch`.

## Reasoning

**Per-branch workflow files would drift.** That is precisely what the branching
model exists to prevent, and CI configuration is exactly the kind of shared
infrastructure the merge-down rule protects. One file, one place to change.

**A gate has to be fast enough that people wait for it.** Smoke is 9 tests in
around 12 seconds for C# and a similar shape for Java. Breadth belongs in the
nightly run, and it belongs at the API and contract level rather than in the
browser regardless.

**Politeness to a shared target is a real engineering constraint here.** Running
the full regression on every push would generate flaky failures that are entirely
our own fault, and would teach the team to ignore red. `concurrency` with
`cancel-in-progress` prevents two runs for the same branch competing.

**A single `gate` job is the required check.** Branch protection points at one
job name, so adding a module or renaming a job does not require editing the
protection rules. It treats `skipped` as acceptable — a module job is skipped
when that module is not on the branch — and anything else, including `cancelled`,
as a failure.

## Consequences

- A regression that only the full suite catches reaches `main` and is found that
  night rather than at the pull request. Accepted, because the alternative is a
  gate nobody trusts.
- The nightly run against a shared sandbox may still flake. When it does, the
  Allure category configuration classifies connection failures as *Environment
  problem*, which is what stops them being triaged as product defects.
- **No secrets are required.** Both suites register their own throwaway accounts,
  so a fork pull request runs the complete gate with nothing injected. This
  removed the whole class of "secrets are not available to fork PRs" problem, and
  it is a direct benefit of the per-test-account decision.

## What a real project should change

Point `shared/environments/<env>.json` at an environment you own. Then raise
`LevelOfParallelism` (C#) and the JUnit parallelism factor (Java), and move the
full regression onto the pull request where it belongs.

## Verification limits

The workflow's YAML was parsed and structurally checked, every action pinned to a
version confirmed against the GitHub API, and every command it runs was executed
locally on the relevant branch. **The workflow itself has not been executed** —
that requires a push and a runner. The first run on GitHub is the real test of
the wiring.
