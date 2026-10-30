# TypeScript Automation Module

Playwright Test against the [Toolshop demo sandbox](https://practicesoftwaretesting.com)
— 48 cases across four suites: API, contract, UI, and the framework's own
internals. One of the four reference implementations in this repository; the C#,
Java and Python modules do the same job with the same layering and the same
vocabulary.

**The one structural fact that makes this module different from the other
three:** Playwright Test is both the runner and the UI driver. There is no
separate browser factory, no base class and no waiting helper, because the
browser, the context, the page and the assertion timeout are all configuration.
Where the other modules have code in `support/` that a test could forget to
inherit, this module has `playwright.config.ts`, which no test can opt out of.

**No credentials are needed to run it.** Every authenticating test registers its
own disposable account over the API. Nothing is shared, so nothing can be locked
out from under another test.

---

## Run it

```powershell
pnpm --dir typescript install --frozen-lockfile
pnpm --dir typescript exec playwright install --with-deps chromium
pnpm --dir typescript test
```

That is the whole setup. Run it from the repository root; the module anchors
every path to its own source location, so no command cares what the working
directory is.

### Suite selection

| Suite         | Command                                  | Cases                                      |
| ------------- | ---------------------------------------- | ------------------------------------------ |
| smoke         | `pnpm --dir typescript test:smoke`       | **23** — 9 product + 14 framework-internal |
| regression    | `pnpm --dir typescript test:regression`  | **27** product                             |
| contract      | `pnpm --dir typescript test:contract`    | **6**                                      |
| all (default) | `pnpm --dir typescript test`             | **47**                                     |
| destructive   | `pnpm --dir typescript test:destructive` | **1**, by hand only                        |

Selection is by tag — `@smoke`, `@regression`, `@contract`, `@destructive`,
`@quarantine` — never by project. The four projects (`support`, `api`,
`contract`, `ui`) exist so `--project ui` works while you are writing a test;
they are not how a suite is chosen. The counts match the Python module's table
exactly, which is the parity check.

47 and not 48, because the lockout case is excluded from every routine run.

#### The destructive suite, and the Playwright behaviour behind it

`test:destructive` runs through a **second config file**, which is worth
explaining because the reason is a property of Playwright rather than a
preference of this module:

> **A CLI `--grep-invert` combines with the config-level `grepInvert` instead of
> replacing it.** Verified on Playwright 1.64.1. The isolating measurement is
> `playwright test --list --grep-invert 'zzz-nothing-matches'`, which reports
> **47**, not 48 — the config pattern still removed the excluded case even though
> the command line supplied a pattern matching nothing.

So a config-level `grepInvert` **cannot be narrowed from the command line at
all**: a CLI pattern can subtract further, never less. `playwright test --grep
@destructive --grep-invert @quarantine` therefore selects **nothing**, which is
the trap this note exists to save you from. The way to select a tag the main
config excludes is a second config:

```powershell
pnpm --dir typescript exec playwright test --list -c playwright.destructive.config.ts --grep @destructive   # 1
```

`playwright.destructive.config.ts` **spreads the default export** of
`playwright.config.ts` and overrides `grepInvert` to `/@quarantine/` alone.
Nothing else is restated, so reporters, workers, `outputDir`, `testIdAttribute`,
the timeout policy and the four projects stay defined in one place and the two
configs cannot drift apart.

Keeping the exclusion in the config rather than in the scripts is deliberate:
**a bare `playwright test` must not select an account-burning test**, and that
holds by construction rather than by everyone remembering a flag.

If you come from the Python module, note that the two behave differently here —
pytest's command-line `-m` _does_ override `addopts`, and Playwright's
`--grep-invert` does not override the config.

### Lint, format and types

```powershell
pnpm --dir typescript lint                 # eslint, then prettier --check
pnpm --dir typescript lint:fix             # eslint --fix, then prettier --write
pnpm --dir typescript exec tsc --noEmit    # required: Playwright transpiles without type checking
```

All three are CI gates. `tsc --noEmit` is not optional ceremony — Playwright
strips types without checking them, so without that gate type errors ship and
fail at runtime in a worker.

The highest-value rule in the set is `@typescript-eslint/no-floating-promises`,
because a missing `await` on a Playwright call is the most common source of flake
in this stack. It is type-aware, which means it only works if the project service
actually resolved a type, and "the rules are configured" and "the rules are
alive" are indistinguishable from a green run. So the wiring is proven rather
than assumed:

```powershell
pnpm --dir typescript exec eslint --print-config src/support/apiHttp.ts   # the rule must be severity 2
```

Deleting an `await` from a discarded promise under `src/` must fail lint naming
that rule specifically — no Playwright rule applies to `src/`, so nothing can
mask the result. Re-run the proof after any change to `eslint.config.js`.

### Useful switches

Everything resolves through one config layer: built-in defaults → `shared/environments/<env>.json`
→ `.env` → `AF_*` environment variables, highest precedence last. No test ever
reads an environment variable itself.

| Variable                   | Effect                                          | Notes                                                                                                                                                      |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AF_ENV`                   | which `shared/environments/<name>.json` to load | **process environment only**, never `.env`; blank counts as unset → `local`                                                                                |
| `AF_UI_BASEURL`            | the UI target                                   | required via some source; one trailing slash stripped; **never defaults to production**                                                                    |
| `AF_API_BASEURL`           | the API target                                  | same; a missing base URL fails the run before any test starts                                                                                              |
| `AF_TIMEOUTS_ELEMENTMS`    | one locator action or web-first assertion       | integer 1000–600000; outside that, the run fails naming the bounds                                                                                         |
| `AF_TIMEOUTS_NAVIGATIONMS` | a page load reaching its ready state            | same bounds                                                                                                                                                |
| `AF_TIMEOUTS_APIMS`        | one HTTP request                                | same bounds                                                                                                                                                |
| `AF_TIMEOUTS_WORKFLOWMS`   | the per-test budget                             | same bounds                                                                                                                                                |
| `AF_HEADLESS`              | `true` / `false`                                | compared lowercased after trimming; anything unrecognised is `false`; **blank is unset**, so a blank value leaves the run headless rather than flipping it |
| `AF_BROWSER`               | `chromium` / `firefox` / `webkit`               | trimmed and lowercased first, so `Chromium` works; anything else fails at configuration resolution quoting your raw value                                  |
| `AF_RUN_ID`                | pins the run id                                 | **process environment only**; falls through to `GITHUB_RUN_ID`, then random                                                                                |
| `AF_DATA_SEED`             | pins the faker seed                             | **process environment only**; the seed is logged every run so you can reproduce one                                                                        |
| `AF_AUTH_*`                | credentials                                     | process environment, then `.env`, **never** the environment descriptor. No test in this module needs one                                                   |
| `AF_WORKERS`               | —                                               | **listed in `.env.example` and deliberately not read**, exactly as in Python. The worker count is pinned in the config; use `--workers` to override        |

A present-but-blank value is treated as **absent** everywhere, so it falls
through to the next source instead of resolving to an empty string. That is the
behaviour that stops a CI expression evaluating to nothing from silently
scattering artifacts or pointing the suite at an empty URL.

#### For humans: headed, UI mode and the debugger

No script exists for these, on purpose — they block, and an agent-run command
must never launch one. Run them yourself:

```powershell
pnpm --dir typescript exec playwright test --ui                        # the interactive runner
pnpm --dir typescript exec playwright test --project ui --headed       # watch the browser
pnpm --dir typescript exec playwright test --project ui --debug        # step through with the inspector
$env:AF_HEADLESS='false' ; pnpm --dir typescript test:smoke           # headed through config instead
```

`AF_HEADLESS=false` is the config route to the same thing, and it is the one that
also applies when the runner starts the browser for you.

### Reports

Every output path is **absolute**, built from the module's own location, so all
of this lands in the same place no matter where you launched the run from:

| Path                                                            | What                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `typescript/reports/junit.xml`                                  | the machine-readable report the CI gate reads                         |
| `typescript/reports/playwright-report/`                         | the HTML report (`open: 'never'`, so it never blocks a run)           |
| `typescript/reports/allure-results/`                            | the human report, with `environment.properties` and `categories.json` |
| `typescript/reports/failure-artifacts/<runId>/<invocationTag>/` | trace, screenshot and video, retained **on failure only**             |

A failing test produces its own diagnosis without being re-run: Playwright's
trace, screenshot and video, plus two attachments this module adds — the page
HTML at the moment of failure, and a diagnostics blob carrying the run id, the
process tag, the worker and parallel slot, the URL, the page title and every
browser console error. Both are attached to the failing test in the HTML report
and in Allure, and both survive a failure in **fixture setup**, not only in the
test body.

`environment.properties` records the resolved environment, both base URLs, the
browser, headless, the element timeout, the run id, the process tag, the data
seed and the Node version. It is rewritten every run. A log line can be
swallowed; a file cannot.

#### Why there is an invocation tag below the run id

Playwright **wipes `outputDir` when a run starts**, so a path keyed only on a run
id is unsafe whenever two invocations legitimately share one — and sharing is the
normal case, not an edge case: every job of a workflow run resolves the same
`GITHUB_RUN_ID`, and `AF_RUN_ID` exists precisely so you can reuse an id on
purpose. Two such runs at once share one directory that each of them deletes, and
the one that started first loses its in-flight trace files mid-run. Measured
here: two concurrent `test:smoke` shells with `AF_RUN_ID` pinned failed 2 of 23
with `ENOENT` thrown from `apiRequestContext.dispose`, reproducibly, while the
same pair with distinct run ids went green both times. That symptom names neither
concurrency nor the run id and reports two passing tests as failures, which is
the kind of failure [automation-principles](../.kiro/steering/automation-principles.md)
rule 8 exists to forbid.

The extra level is therefore the same idea as
[ADR 0006](../docs/decisions/0006-process-tag-in-generated-identity.md), applied
one layer down. That ADR keeps a shared run id and adds a **per-process** tag so
generated identities stay unique; this keeps a shared run id and adds a
**per-invocation** tag so output paths stay unique. Per-invocation rather than
per-process because all the workers of one run must agree on one directory, which
is why the tag is minted once in the main process and pinned into the environment
for the workers to inherit — the same mechanism that gets the run id to a worker.
It is internal plumbing: no documented variable, no `.env.example` entry, nothing
to set, and it appears in no identity, log line or report field.

---

## Node 22 versus Node 25 — read this before you trust a local result

**The pin is Node 22 LTS.** The machine this module was built and verified on
runs **Node v25.6.1**. That divergence is real, documented here in full, and the
subject of a recommended ADR.

**Why the pin stays at 22.** Node 25 is odd-numbered and will never be an LTS
release. Moving the repository's steering to match one developer machine would be
fitting the standard to the accident.

**Why no version manager was used instead.** There is no tool on that machine
that can supply Node 22: corepack is unbundled at Node 25 and absent, and no
version manager (volta, fnm, nvm, nvs) is installed. The 22 path is first
genuinely exercised in CI.

How the requirement is declared, and what actually enforces it:

| Surface                       | Value                                         | Enforced?                              |
| ----------------------------- | --------------------------------------------- | -------------------------------------- |
| `package.json` `engines.node` | `>=22.13.0`                                   | advisory locally                       |
| `.node-version`               | `22`                                          | read by CI and by version managers     |
| CI `actions/setup-node`       | `node-version-file: typescript/.node-version` | **yes — this is the only enforcement** |
| this README                   | the divergence, in full                       | documentation                          |

**Why `engines.node` is a floor and not a range.** `"22.x"` would exclude 25, and
pnpm could then refuse to install on the only machine available to run the suite
— the documented command would fail for the person following the documentation.
A floor states the real requirement, _nothing older than this_, and the exact
runtime lives in `.node-version` where CI reads it. The floor is `22.13.0` rather
than `22.0.0` because it tracks **the strictest tool in the pinned set** — ESLint
10's own minimum — rather than the LTS major.

**Why `.npmrc` cannot carry the enforcement.** pnpm's `engine-strict` is an
`.npmrc` setting, and `.npmrc` is **gitignored repository-wide** (it sits in the
secrets block of `.gitignore`), so no pnpm setting can be shared through it at
all. Anything that must be shared goes in `package.json` or in the workflow.
That is also why `packageManager` is declared rather than relying on corepack.

**Why `@types/node` is pinned to the 22 line (22.20.5) and not the registry's
latest.** The compiler must not know about APIs the CI runtime lacks. A
type-level pass against a newer line would surface as a runtime `TypeError` in
CI, which is the worst possible place to find it. The pin moves when
`.node-version` moves.

**`.nvmrc` is deliberately not added.** `actions/setup-node` reads
`.node-version`, version managers read it too, and two files with the same
content are two files that can disagree. On nvm: `nvm use 22`.

### Which verifications ran on Node 25

**All of them. Every local result in this module is a Node 25.6.1 result** —
install, `tsc --noEmit`, lint, the floating-promise proof, all five suite counts,
every suite run, the artifact-location checks, both deliberate-failure shapes,
the concurrent run-identity check, every configuration behaviour, and the
destructive case. `environment.properties` records `nodeVersion=25.6.1` for each
of them, so no result can be mistaken for a Node 22 one.

**The first CI run is the real acceptance of the Node 22 path.** The specific
places the two runtimes could differ: a different V8/ICU build affecting date and
number formatting (mitigated by pinning `locale: en-US` and `timezoneId: UTC` in
config), Node's ESM/CJS interop details around the ajv import, and `undici`'s
behaviour under Playwright's request context. None is likely. All are possible.

### TypeScript is pinned to 5.9.3, and that pin has an obligation

7.x is the latest release; this module pins **5.9.3**, because
`typescript-eslint@8.71.2` peers `typescript <6.1.0` and the type-aware
floating-promise rules are the module's highest-value gate. The gate wins.

**The obligation: re-check this on the next dependency-bump PR.** When
typescript-eslint supports a newer compiler, move both together — and re-run the
floating-promise proof afterwards, because a silently inert rule set is the one
failure this module cannot detect from a green run.

---

## Layout

Five layers, dependencies strictly downward — `tests → flows → pages/clients → support/models`.
Code belongs in exactly one.

```text
typescript/
├── playwright.config.ts              projects, reporters, the timeout policy, testIdAttribute
├── playwright.destructive.config.ts  the above, spread, with grepInvert narrowed
├── global.setup.ts                   once per run, in the main process, before workers fork
├── src/
│   ├── support/   repoPaths, runContext, config, timeouts, redaction, testLog, apiHttp,
│   │              navigation, consoleErrorPolicy, testValues, schemaValidation, require,
│   │              reporting, fixtures
│   ├── models/    product, pagedProducts, auth, registration, apiError, testAccount
│   ├── clients/   apiResult, productsClient, authClient, usersClient
│   ├── pages/     homePage, productDetailPage, loginPage, accountPage
│   └── flows/     accountFlow, authFlow
└── tests/
    ├── api/       productCatalogue (11), auth (8)
    ├── contract/  toolshopContract (6)
    ├── ui/        productBrowsing (5), signIn (4)
    └── support/   runContext (6), redaction (4), config (3), consoleErrorPolicy (1)
```

Assertions live **only** in `tests/`. Page objects and clients return state and
typed models and assert nothing, which is what makes them reusable in the
negative-path tests where the expected outcome is a failure.

`tests/support/` is the documented divergence from the `{ui,api,contract}` shape:
a unit-level check of a framework internal belongs to no product suite, so it
sits under the test tree mirroring the layer it checks.

### Test inventory

| Where             | Cases                      | `@smoke` | `@regression` |
| ----------------- | -------------------------- | -------- | ------------- |
| `tests/support/`  | 14                         | 14       | —             |
| `tests/api/`      | 19 (18 + 1 `@destructive`) | 5        | 18            |
| `tests/contract/` | 6                          | —        | —             |
| `tests/ui/`       | 9                          | 4        | 9             |
| **total**         | **48**                     | **23**   | **27**        |

The contract suite carries `@contract` alone, which is why the three tag
selections do not add up to 47.

---

## The parts worth reading first

**`src/support/config.ts`** — the resolution chain, and the only place the suite
fails fast. It is evaluated by `playwright.config.ts`'s first statement, which
Playwright runs _before_ `globalSetup`, so a missing base URL stops the run
before a browser or a worker exists. The fail-fast message names every missing
key and all three sources it checked. A pure `resolveConfig(env)` sits behind the
cached `loadConfig()`, which is what makes the timeout-override tests pure — no
`process.env` mutation, so they are safe under parallel workers.

**`src/support/runContext.ts`** — why there is a process tag as well as a run id.
A run id alone is not enough: two module jobs in one workflow run share it and
each restarts its own counter at 1, so the second job re-mints addresses the
first already registered and the API answers `409`. The process tag keeps the
identity unique per process while the run id stays traceable. Identities are
`af-{runId}-{processTag}-{n}@example.invalid`, mirroring the three shipped
modules step for step — including the detail that the tag's length break is
counted on the **retained** characters, before the alphanumeric filter, so
`GITHUB_JOB=typescript-suite` gives `typescriptsu` and never `typescripts`.

**`src/support/redaction.ts`** — the choke point. Five header names, nineteen
field names, four patterns, matched by equality after lowercasing, replaced with
exactly `***REDACTED***`. Never partially revealed, never a length, never a full
header block. It is called from inside `testLog`, `apiHttp` and `reporting`
rather than at the call sites, because a choke point is the only enforceable
form.

**`src/support/apiHttp.ts`** — where a request becomes a report. Both the request
and the response block are attached with every header value redacted by name, and
the correlation id `af-{runId}-{processTag}-{seq}` is minted **per request**, not
set once on the context, because the format carries a sequence.

**`src/support/navigation.ts`** — the module's only `goto` call site, which is a
verified grep rather than a convention. It waits for `domcontentloaded`, not
`load`: against this single-page application `load` waits for every subresource
while the client-side router supersedes the initial navigation, surfacing as
`net::ERR_ABORTED` on a page that rendered perfectly well. That was a race in the
waiting strategy, and retrying would have hidden it.

**`src/support/fixtures.ts`** — the only `test` object a spec imports. Clients,
flows and created data are fixtures; **page objects are not**, deliberately — a
`homePage` fixture hides which screen a test starts on. `failureArtifacts` is the
module's only auto fixture and it lives on `uiTest` alone, because an auto fixture
depending on `page` would launch a browser for all 48 cases when 39 of them never
open one.

**`src/flows/accountFlow.ts`** — the flow that exists because of a real outage.
Read the header comment.

**`src/support/schemaValidation.ts`** — one ajv instance per process, every
`shared/contracts/*.schema.json` registered under its bare file name, which is
what makes the cross-file `$ref` and the internal `#/$defs/` references resolve
from memory with no network fetch. Violations are sorted by path **segments**, so
`/data/2` precedes `/data/10`.

---

## Things this suite proves on purpose

**A shared test account is shared mutable state.** The negative sign-in tests
send a wrong password deliberately. Against a shared demo account that
incremented a server-side failed-attempt counter until it locked, and the API
began answering `423 Locked` to _every_ login — including the happy paths, in two
language modules at once. That was not an application bug; it was a test-design
defect. Every authenticating test here registers its own account, and the test
that burns one is tagged `@destructive` and excluded from every routine run.

**So assert the lockout deliberately rather than discovering it.** The
`@destructive` case asserts three things: the lockout tripped, every attempt
before it answered 401, and the **correct** password is afterwards refused with 423. Behaviour a suite can break itself on is behaviour worth a test.

**"Assert zero console errors" does not survive contact with a real app.** The
Toolshop logs a 401 on every anonymous catalogue load. The console assertion
filters through a reviewed allowlist in `consoleErrorPolicy.ts` — six entries,
each with the reason it is there — and never asserts zero.

**Reading a collection of elements is a race if you count first.** `count()` then
`nth(i)` in a loop raced the grid re-render and timed out. The page objects make
one `allInnerTexts()` call. A lint rule bans reintroducing the other shape.

**Nothing waits on the clock.** No fixed delays anywhere, in tests or in page
code. Waits are web-first assertions on a condition — `toContainText` after a
search, `not.toHaveText` after paging — and every timeout comes from one policy
in `support/`. Two lint rules and a grep keep it that way.

**Unknown response members are ignored by the models and reported by the
contract suite.** Plain object schemas strip unknown keys, which is exactly what
all three shipped modules do. The stricter and looser spellings Zod 4 offers —
strict, passthrough, strictObject, looseObject, catchall — are banned, as is
coerce, which would make this module accept payloads the other three reject.
Strict validation belongs in the contract tests, against `shared/contracts/`,
where one definition serves four modules. A grep for all six spellings is a
verification step.

**A retry is a diagnostic tool, not a fix.** `retries: 0`, in CI as well as
locally. Playwright's JUnit reporter records a retried-then-passed test with its
final status, so a retry would make this the one module of four whose flake goes
green on the required check.

---

## Parity notes for anyone comparing four modules

Three things that would otherwise read as defects:

- **`headless=true` renders lowercase** in the startup line and in the Allure
  environment block, here and in Java, while Python and C# render `True`. The
  field names and their order are the parity that matters; the lowercase form is
  forced by `restrict-template-expressions`, which rejects interpolating a
  boolean, so the value goes through an explicit `String(...)`.
- **`navigation.toPath` and `idsOf` are renames** of the shipped `to` and `ids`.
  Behaviour is identical. As free functions the bare names read wrong —
  `navigation.to(page, '/')` reads as a preposition rather than a verb, and `ids`
  reads as a collection rather than an accessor. The shipped modules can afford
  the short names because the call is a method on an object, where the sentence
  completes itself.
- **`email` and `phone` are deliberately excluded from the redaction field
  list.** `test-data-and-secrets.md` names both, and all three shipped modules
  omit them on purpose so a generated identity stays readable in a log — which is
  the whole diagnostic value of embedding the run id and process tag in the
  address. This module makes **four**, so that bullet of the steering is now
  narrowed by every module in the repository rather than by three of them. The
  owed ADR (`0007`) is still unwritten.

---

## Known gaps

Honest list, in the same shape as the other three READMEs.

- **Not wired into CI.** `.github/workflows/ci.yml` is owned elsewhere; the
  follow-ups table below says exactly what the job needs. This module is the
  **second** waiting on that file — there is still no `python` job either.
- **Registered accounts are never deleted.** The demo API offers no self-delete.
  Every address is `af-{runId}-{processTag}-{n}@example.invalid`, so the `af-`
  prefix and the embedded run id let a janitor find them. A real project
  registers cleanup at creation time.
- **Nothing clears `reports/allure-results/` between local runs.**
  `environment.properties` is rewritten each run, but the previous run's _result_
  files remain, so a locally generated Allure report merges two runs. CI is
  unaffected — a clean machine every time — and the Python module behaves the
  same way, so this is parity rather than a regression. The remedy if it becomes
  annoying: `Remove-Item typescript/reports/allure-results/* -Recurse` first. A
  `pretest` script is the obvious fix and is deliberately not added, because a
  script that deletes a directory should have a reason behind it.
- **Chromium only.** Firefox and WebKit belong in a scheduled job; `AF_BROWSER`
  already supports both.
- **`workers` is pinned to 2, not `50%`.** Measured against this exact public
  sandbox by the C# module: four workers produced five self-inflicted failures
  (connection resets, SSL handshake failures, navigation timeouts) and a 35s wall
  clock, while two produced 34/34 green in 12s. `ci-cd-pipelines.md`'s 50% of CPU
  is right for infrastructure you own and wrong for a shared free sandbox. Use
  `--workers` to measure again.
- **No cross-tenant test.** The demo has roles but not tenants, so the
  highest-value authorization case has nowhere to run.
- **No accessibility scan, no visual tests, no sharding, no Testcontainers.**
  `@axe-core/playwright` would slot into `productBrowsing.spec.ts`; visual tests
  need a controlled environment; one runner meets the time budget, and the `blob`
  reporter plus `--shard` is the documented next step if it stops doing so; and
  there is nothing to stand up in a container against a hosted demo.
- **No secret-safe object printing.** C# overrides `ToString()` and Python
  overrides `__str__`/`__repr__`; Playwright's `expect` formatter honours neither,
  so there is no reliable override here. Replaced by the redaction choke point,
  named `describe*` functions, and the rule that no assertion takes a
  credential-bearing object. This is a genuine reduction in defence in depth and
  is flagged rather than glossed.
- **Several client and page members the shipped modules have are not ported** —
  `create`, `deleteIgnoringMissing`, `listByBrand`, `hasCustomerCredentials`,
  `visibleProductCount`, `artifactDirectory`, `safeTestName`. No test in any
  module calls them, and a surface with no caller is surface that rots.

---

## Follow-ups owned outside this module

This module touches no file outside `typescript/`. Everything below is owed
elsewhere, recorded here so the hand-off is committed rather than spoken.

| #   | Where                                  | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.github/workflows/ci.yml`             | a `typescript` job in the shape the existing jobs use: a `detect` output probing `typescript/package.json`; `pnpm/action-setup@v4` **before** `setup-node`, with `package_json_file: typescript/package.json` — **required**, because the action reads `packageManager` from a repository-root `package.json` by default and this repository has none, so without it the step fails on "no pnpm version is specified"; `setup-node` with `node-version-file: typescript/.node-version` and `cache: pnpm`; install, lint, `tsc --noEmit`; an `ms-playwright` cache keyed on the `@playwright/test` version; `playwright install --with-deps chromium`; suite selection branching on `needs.detect.outputs.suite`; `junit_summary.py` against `typescript/reports/junit.xml`; two `upload-artifact` steps (reports 30 days, failure artifacts 7 days); `typescript` added to `gate`'s needs. **No retry handling at any level**, no `env` additions, no secrets. `actions/setup-node` and `pnpm/action-setup` have no counterpart in the file, so their majors need confirming. **The `python` job is still outstanding, so two jobs are owed** — one PR keeps `detect`, `gate` and the summary table consistent |
| 2   | root `README.md`                       | the TypeScript section, mirroring the other three: canonical commands, the `AF_*` table, the case inventory, that the suite needs no credentials, and the Node 22-versus-25 divergence in one line pointing here. The "Per-language approach → TypeScript" subsection exists and is empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | `docs/decisions/`                      | three ADRs. The owed `0007` on the redaction field list excluding `email` and `phone`, now narrowed by **four** modules. A new one on **targeting Node 22 while the development machine runs Node 25** — recommended here, not written here. One on **not reusing a shared `storageState`**, which `typescript-testing.md` prescribes and which would be a shared account                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | `.kiro/steering/tech.md`               | a **new row** for JSON Schema validation covering all four modules — `JsonSchema.Net`, `com.networknt:json-schema-validator`, `jsonschema`, `ajv`. The table has no JSON-Schema row for _any_ language today, so this is a new concern rather than a value added to the TypeScript row. `python/README.md`'s follow-ups table describes it as a value addition and needs the same correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | `.kiro/steering/structure.md`          | extend the framework-internal-test clause, which names only a C# `Support/` folder and a Java `support/` package, to include `python/tests/support/` **and** `typescript/tests/support/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 6   | `.kiro/steering/typescript-testing.md` | six clarifications: the `setup`-project-plus-`storageState` paragraph needs the per-test-disposable-account exception; the `extraHTTPHeaders` correlation-id line should say the id is per request and minted in the client wrapper; `retries: process.env.CI ? 1 : 0` should note that zero is this repo's parity choice; the "fixtures provide page objects" line and its example should say page objects are constructed in the test body here, and that an API client fixture needs its own `APIRequestContext` whenever `use.baseURL` is the UI host; the layout block's `waits.ts` entry should note that a module whose runner owns the waiting policy has none; and the config example's `workers: '50%'` and `devices['Desktop Chrome']` both need a note — this repo pins a measured worker count and sets `browserName`, `viewport`, `locale` and `timezoneId` from config rather than spreading a device descriptor that would silently override them                                                                                                                                                                                                                                              |
| 7   | `.env.example`                         | **no change at all.** Every variable this module reads is already documented, and the module introduces no new one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 8   | `java/` — unverified, do not assume    | the Playwright `--grep-invert` finding above has a shape worth checking elsewhere. Java excludes `quarantine,destructive` through Surefire `<excludedGroups>`, where `groups` and `excludedGroups` both apply and exclusion wins, so `-Dgroups=destructive` **may select nothing there for the same reason**. Unverified. Python's `addopts = -m "not destructive and not quarantine"` is probably fine, because a command-line `-m` overrides `addopts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
