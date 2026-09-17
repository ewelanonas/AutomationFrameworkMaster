---
inclusion: auto
name: ci-cd-pipelines
description: CI/CD conventions for running the automation suites — pipeline stages, suite selection and gating, parallelism and sharding, containers and browser setup, secret injection via OIDC, artifact retention, and required checks. Use when creating or editing workflow files, pipeline definitions, Dockerfiles for test runners, or when asked about running suites in CI.
---

# CI/CD for the Automation Suites

## Pipeline stages

Fail fast, cheapest first:

```text
1. lint + format + type check      < 2 min   every push
2. build / compile (warnings=errors) < 3 min   every push
3. contract + API smoke             < 5 min   every push  ← PR gate
4. UI smoke (chromium, headless)    < 5 min   every push  ← PR gate
5. full regression (all modules)    < 30 min  merge to main
6. cross-browser + a11y + visual    nightly
7. real third-party integration     nightly, non-gating
```

Stages 1–4 are required checks for merge. Nothing that takes longer than ~15
minutes total belongs in the PR gate; move breadth to nightly and depth down
the pyramid.

## Suite selection

Select by tag, never by file path lists that drift:

| Suite      | C#                          | Java                 | Python        | TypeScript        |
| ---------- | --------------------------- | -------------------- | ------------- | ----------------- |
| smoke      | `--filter Category=Smoke`   | `-Dgroups=smoke`     | `-m smoke`    | `--grep @smoke`   |
| regression | `--filter Category=Regression` | `-Dgroups=regression` | `-m regression` | `--grep @regression` |
| contract   | `--filter Category=Contract`| `-Dgroups=contract`  | `-m contract` | `--grep @contract`|

Exclude quarantine everywhere: `--filter Category!=Quarantine`,
`-DexcludedGroups=quarantine`, `-m "not quarantine"`, `--grep-invert @quarantine`.

## Parallelism and sharding

- Enable in-process parallelism first (workers/threads), then shard across
  runners only when a single runner cannot meet the time budget.
- Workers: `50%` of available CPU for browser suites, `100%` for API suites.
  More workers than cores produces timeouts that look like product bugs.
- Sharding: Playwright `--shard=i/n`; NUnit/JUnit/pytest split by tag or by a
  balanced test-name partition. Merge reports afterwards — never publish n
  partial reports.
- Every shard writes JUnit XML to a distinct path, then a merge step produces
  one combined report and one combined Allure result set.

## Runner environment

- Pin the runner image by tag or digest. Never `latest`.
- Pin toolchain versions in the workflow (`dotnet-version: 8.0.x`,
  `java-version: 21`, `python-version: 3.12`, `node-version: 22`).
- Install browsers with the matching Playwright version and `--with-deps`.
  A mismatched browser install is the most common CI-only failure.
- Cache: NuGet packages, `~/.m2`, uv cache, pnpm store, and the Playwright
  browser cache keyed on the lock file hash plus the Playwright version.
- Always headless. Never `--headed`, never a UI mode, never a watch mode.
- Set `CI=true` so configs switch to CI behaviour (retries, workers,
  `forbidOnly`).
- Use `TZ=UTC` and a fixed locale on every runner.

## Containers

- Prefer the official Playwright container image matching the library version
  for browser suites; it removes the OS dependency drift entirely.
- Use Testcontainers for backing services (DB, broker, wiremock) instead of
  long-lived shared infrastructure. Container startup waits use a readiness
  strategy, never a sleep.
- Give every container a run-scoped label so a janitor can clean orphans.

## Secrets

- Inject through the platform secret store as environment variables. Never in
  the workflow file, never in a committed config, never echoed to logs.
- Prefer **OIDC federation** to cloud providers over long-lived keys. Where a
  static credential is unavoidable: scoped to the test environment only,
  documented owner, documented rotation cadence.
- Mask secrets in logs at the platform level as well as in the framework's
  redaction layer. Belt and braces.
- Never expose secrets to workflows triggered by `pull_request` from a fork.
  Use a separate, manually-approved workflow for fork PRs that need an
  environment.
- Never run the suite against production with production credentials from a PR
  pipeline. Environment protection rules and required reviewers on the
  production environment.
- Add secret scanning and dependency scanning to the same pipeline. A leaked
  key found in review is a leaked key.

## Artifacts and retention

Upload on failure, and always for the gating suites:

| Artifact          | Retention | Notes                                  |
| ----------------- | --------- | -------------------------------------- |
| JUnit XML         | 30 days   | Feeds the test-report check            |
| Allure results    | 30 days   | Merged and published as a static site  |
| Playwright traces | 7 days    | Failure only; they are large           |
| Screenshots/video | 7 days    | Failure only                           |
| Logs              | 14 days   | Redacted                               |
| HAR files         | do not upload unless scrubbed of headers |

Publish a test-results summary on the PR: totals, failures with names, flake
count, duration, and links to the trace for each failure. A red check with no
readable reason gets ignored.

## Gating rules

- A failing gating suite blocks merge. No override without a documented
  incident.
- A new flake detected on main opens a ticket automatically.
- Never make the test job `continue-on-error` to unblock a release. That
  converts the suite into decoration.
- Nightly failures have a named rotation owner and a triage SLA of one
  business day.

## Change-based optimisation

- Path filters may skip a module whose files did not change, but never skip
  contract tests when `shared/contracts/**` changed, and never skip the smoke
  suite on a release branch.
- Run the full matrix on `main`, on release branches, and on any change to
  `.kiro/`, `shared/`, or CI definitions.

## Branching and release

- Work on feature branches; open a PR. Never push directly to `main` or a
  release branch, and never modify a release branch outside a PR.
- Suite changes and product changes travel together where possible so the gate
  reflects reality at merge time.
