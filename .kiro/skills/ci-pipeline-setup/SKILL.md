---
name: ci-pipeline-setup
description: Create or fix a CI pipeline that runs the automation suites — stage ordering, tag-based suite selection, caching, browser installation, sharding and report merging, OIDC secret injection, artifact retention, and PR result annotation. Use when adding or editing workflow files, debugging a CI-only test failure, speeding up a pipeline, or wiring a new module into CI.
---

# CI Pipeline Setup

## Step 1 — Decide the gate before writing YAML

Two questions determine the whole design:

1. **What blocks merge?** Lint, build, contract + API smoke, UI smoke. Total
   budget: 15 minutes. Anything slower goes to a post-merge or nightly job.
2. **What runs on a schedule?** Full regression, cross-browser, accessibility,
   visual, and real third-party integration.

If the PR gate exceeds the budget, the fix is moving tests down the pyramid, not
adding runners.

## Step 2 — Stage order

```text
lint + format + typecheck   ← fails in 2 min, catches most mistakes
build (warnings as errors)
contract + API smoke        ← required
UI smoke (chromium headless) ← required
─────────── merge allowed ───────────
full regression (all modules)        on main
cross-browser + a11y + visual        nightly
real integration (non-gating)        nightly
```

Run the four language modules as a matrix so one module's failure does not hide
the others. Use `fail-fast: false`.

## Step 3 — Pin everything

- Runner image by tag or digest, never `latest`.
- Toolchain versions explicit: `dotnet-version: 8.0.x`, `java-version: 21`,
  `python-version: 3.12`, `node-version: 22`.
- Lock files with `--frozen-lockfile` / `--locked` / `-Dmaven.repo.local` cache
  restore. A CI run that resolves a floating version is not reproducible.
- Playwright browsers installed with the **matching library version**. Version
  drift between the library and the browser install step is the single most
  common CI-only failure.

## Step 4 — Cache correctly

| Ecosystem | Path                        | Key                                  |
| --------- | --------------------------- | ------------------------------------ |
| NuGet     | `~/.nuget/packages`         | hash of `packages.lock.json`         |
| Maven     | `~/.m2/repository`          | hash of `pom.xml`                    |
| uv        | uv cache dir                | hash of `uv.lock`                    |
| pnpm      | pnpm store                  | hash of `pnpm-lock.yaml`             |
| Browsers  | Playwright cache dir        | OS + Playwright version              |

Key the browser cache on the Playwright version, not the lock file hash alone,
or you will restore browsers that do not match the library.

## Step 5 — Suite selection by tag

Never by file path lists; they drift.

| Suite      | C#                             | Java                  | Python           | TypeScript             |
| ---------- | ------------------------------ | --------------------- | ---------------- | ---------------------- |
| smoke      | `--filter "Category=Smoke&Category!=Quarantine"` | `-Dgroups=smoke -DexcludedGroups=quarantine` | `-m "smoke and not quarantine"` | `--grep @smoke --grep-invert @quarantine` |
| regression | `Category=Regression`          | `-Dgroups=regression` | `-m regression`  | `--grep @regression`   |
| contract   | `Category=Contract`            | `-Dgroups=contract`   | `-m contract`    | `--grep @contract`     |

Quarantined tests are excluded from every gating suite and included in nightly.

## Step 6 — Parallelism, then sharding

- In-process workers first: 50% of CPU for browser suites, 100% for API suites.
  More workers than cores produces timeouts that look like product bugs.
- Shard across runners only when one runner cannot meet the budget.
- Every shard writes JUnit XML and Allure results to a **distinct path**, then a
  merge job combines them. Publishing n partial reports means nobody can see the
  run.
- Playwright: `--shard=${{ matrix.shard }}/${{ strategy.job-total }}` plus
  `blob` reporter and `merge-reports` for a single HTML/Allure output.

## Step 7 — Secrets

- Inject from the platform secret store as environment variables. Never in the
  workflow file, never in a committed config.
- Prefer **OIDC federation** to cloud providers over long-lived keys. Where a
  static credential is unavoidable: scoped to the test environment only, with a
  documented owner and rotation cadence.
- Set `permissions:` explicitly and minimally at the workflow level
  (`contents: read`, plus `id-token: write` only where OIDC is used).
- Never expose secrets to a `pull_request` trigger from a fork. Use a separate,
  manually approved workflow for fork PRs that need an environment.
- Never run against production from a PR pipeline. Protect the production
  environment with required reviewers.
- Add secret scanning and dependency scanning to the same pipeline.
- Mask at the platform level **and** in the framework's redaction layer.

## Step 8 — Environment behaviour

- `CI=true` so configs switch to CI mode: retries 1, worker cap,
  `forbidOnly`, headless.
- `TZ=UTC` and a fixed locale on every runner.
- Always headless. Never a `--headed`, `--ui`, or watch command in CI.
- Testcontainers for backing services with readiness strategies, labelled with
  the run id so orphans can be cleaned.

## Step 9 — Artifacts and PR annotation

| Artifact          | When            | Retention |
| ----------------- | --------------- | --------- |
| JUnit XML         | always          | 30 days   |
| Allure results    | always          | 30 days   |
| Traces            | failure only    | 7 days    |
| Screenshots/video | failure only    | 7 days    |
| Logs (redacted)   | always          | 14 days   |
| HAR               | do not upload unless scrubbed of headers |

Publish a PR comment or check summary with: totals, each failure by name with
its message, flake count, duration, and a link to the trace for each failure. A
red check with no readable reason gets ignored, and then the gate is decoration.

Use `if: always()` on upload and publish steps, or you lose the artifacts for
exactly the runs you need them for.

## Step 10 — Debugging a CI-only failure

Work down this list; it is ordered by how often each is the cause:

1. Browser/library version mismatch, or browsers not installed with
   `--with-deps`.
2. Worker count too high for the runner — everything times out at once.
3. Missing environment variable or secret; config silently fell back to a
   default. (Fix the config to fail fast instead.)
4. Timezone or locale difference from the developer machine.
5. Slower machine exposing a real race that a sleep was hiding locally.
6. Shared test data colliding between concurrent shards.
7. Network egress rules blocking a dependency.
8. Clean-checkout assumption: a file that exists only on the dev machine.
9. Container startup not actually waited for.

Reproduce locally by running in the same container image with `CI=true`, the
same worker count, and the same TZ before changing test code.

## Verify

- Run the pipeline on a branch and confirm every gating stage is green.
- Confirm JUnit XML and Allure artifacts exist and are non-empty for each
  module.
- Deliberately fail one test, push, and confirm: the check goes red, the
  summary names the test, and the trace is downloadable. Then revert.
- Confirm no secret value appears in the logs.
- Confirm branch protection lists exactly the intended required checks.

Step 3 of this verification is the one people skip, and it is the one that
proves the pipeline is useful rather than merely green.
