# AutomationFrameworkMaster

A polyglot test automation framework reference. Four independent stacks —
**C#**, **Java**, **Python**, **TypeScript** — built to the same architecture,
so a team can copy the one they need into a product repo and get a suite that
runs green in parallel, headless, in CI, on day one.

The repo also ships its own **AI pair-programming setup** in `.kiro/`: steering
files that encode the standards, and skills that walk through the common
automation tasks. If you use Kiro, the agent already knows the house rules.
See [Working with Kiro](#working-with-kiro).

---

## Contents

- [Branching model](#branching-model)
- [Layout](#layout)
- [The architecture](#the-architecture)
- [Non-negotiable rules](#non-negotiable-rules)
- [Per-language approach](#per-language-approach)
  - [C# / .NET](#c--net)
  - [Java](#java)
  - [Python](#python)
  - [TypeScript](#typescript)
- [Setup](#setup)
- [Working with Kiro](#working-with-kiro)
- [Definition of done](#definition-of-done)

---

## Current state

The standards, the agent setup, and the shared contracts are in place on `main`.
**The Java module is built and green.** The other three each get their own
branch — switch to it and run [workflow 1](#1-bootstrap-a-new-module).

```powershell
git switch framework/java
mvn -f java/pom.xml -B clean test     # 33 tests, ~28s
```

| Piece | Status |
| --- | --- |
| `.kiro/steering/` — 15 files | Ready |
| `.kiro/skills/` — 8 skills | Ready |
| `docs/mcp/` + MCP config template | Ready |
| `.env.example`, `.gitignore` | Ready |
| `shared/environments/`, `shared/contracts/` | Ready — [demo target](#the-demo-target) |
| `docs/decisions/` | Ready — 1 ADR |
| `java/` on `framework/java` | Ready — 33 tests |
| `csharp/` `python/` `typescript/` | Branch not created yet |
| `.github/workflows/` | Not created |

## Branching model

Each language module lives on its own long-lived branch. `main` carries only
the shared foundation.

```text
main                      Standards, skills, docs, shared/ contracts.
│                         No language module code.
├── framework/java        main + java/
├── framework/csharp      main + csharp/
├── framework/python      main + python/
└── framework/typescript  main + typescript/
```

| Branch | Status |
| --- | --- |
| `main` | Ready |
| `framework/java` | **Ready** — 33 tests green in ~28s. [Module README](https://github.com/ewelanonas/AutomationFrameworkMaster/blob/framework/java/java/README.md) |
| `framework/csharp` | Not created |
| `framework/python` | Not created |
| `framework/typescript` | Not created |

### Checking out a framework

Clone once, then switch to the stack you need:

```powershell
git clone https://github.com/ewelanonas/AutomationFrameworkMaster.git
cd AutomationFrameworkMaster
git switch framework/java
```

Already cloned:

```powershell
git fetch origin
git switch framework/java
```

Every framework branch contains the full `.kiro/` setup, so the agent applies
the same standards no matter which one you are on.

### The one rule that keeps this working

**Shared changes go to `main` first, then merge down. Never the reverse.**

```text
Editing .kiro/, docs/, shared/, README, .gitignore
    → commit on main → merge main into each framework/* branch

Editing java/ (or csharp/, python/, typescript/)
    → commit on that framework branch only
```

```powershell
# after a change lands on main, refresh a framework branch
git switch framework/java
git merge origin/main
```

Why this matters, stated plainly: **long-lived parallel branches drift.** If the
Java branch edits `automation-principles.md` and the Python branch edits it too,
you get a conflict that nobody wants to resolve, and eventually four different
sets of standards. Keeping the shared foundation single-sourced on `main` is
what stops that. It costs one merge per branch when a standard changes, which is
a fair price.

If you would rather see all four stacks in one working tree — useful when
changing a standard that affects every module — say so and we can flatten this
to trunk-based with folder ownership instead. The tradeoff is that a Java
developer then clones three stacks they will never run.

### Day-to-day work

Do not commit straight to a `framework/*` branch for anything non-trivial.
Branch off it, then open a PR back into it:

```powershell
git switch framework/java
git switch -c feat/java-checkout-tests
# ... work ...
git push -u origin feat/java-checkout-tests
gh pr create --base framework/java
```

## Layout

The target shape across all branches. On any single branch you see `.kiro/`,
`docs/`, `shared/`, and **one** language module — the one that branch owns.
Entries marked *(planned)* do not exist on any branch yet.

```text
AutomationFrameworkMaster/
├── .kiro/                                         on every branch
│   ├── steering/         Standards the agent always applies (15 files)
│   ├── skills/           Task workflows the agent follows (8 skills)
│   └── settings/         MCP server config — gitignored, copied from docs/mcp/
├── csharp/               .NET module              on framework/csharp
├── java/                 JVM module               on framework/java
├── python/               Python module            on framework/python
├── typescript/           TypeScript module        on framework/typescript
├── shared/                                        (planned)
│   ├── contracts/        OpenAPI / JSON Schema — the source of truth
│   ├── testdata/         Language-neutral payloads
│   └── environments/     Non-secret env descriptors (URLs, timeouts)
├── docs/
│   ├── mcp/              MCP server setup
│   └── decisions/        ADRs: NNNN-short-title.md   (planned)
├── .github/workflows/    CI                       (planned)
├── .env.example          Every variable the suites need
└── .gitignore
```

The four language modules share **nothing at runtime**. They share only
contracts and test data under `shared/`. That is deliberate: a team copying
`python/` into their repo should not inherit a dependency on `java/`.

---

## The architecture

Every module implements the same five layers. Code belongs in exactly one of
them. If you cannot decide where something goes, the responsibility is wrong,
not the rule.

```text
┌─────────────────────────────────────────────────────────────┐
│ tests/     Scenarios. Arrange-act-assert.                   │
│            The ONLY place assertions live.                  │
├─────────────────────────────────────────────────────────────┤
│ flows/     Multi-step business actions.                     │
│            "checkout with a saved card". No assertions.     │
├─────────────────────────────────────────────────────────────┤
│ pages/     UI interaction wrappers. Locators live here.     │
│ clients/   API wrappers. Return typed models, never throw   │
│            on non-2xx.                                      │
├─────────────────────────────────────────────────────────────┤
│ support/   Config, fixtures, browser lifecycle, waits,      │
│            redaction, reporting hooks, builders.            │
├─────────────────────────────────────────────────────────────┤
│ models/    DTOs, enums, request/response shapes.            │
└─────────────────────────────────────────────────────────────┘
```

Dependencies point **downward only**: `tests → flows → pages/clients →
support/models`. A page object never imports a test. `support/` never imports
`tests/`.

Why this shape holds up: assertions in one layer means a page object stays
reusable in a negative-path test, where "expected" is failure. Locators in one
layer means a UI change is a one-file fix. Clients that do not throw means a
403 test reads the same as a 200 test.

### Reporting is uniform

Every module emits **JUnit XML** (for CI to annotate the PR) and **Allure**
(for humans). One CI job publishes one report covering all four languages.

---

## Non-negotiable rules

The full set is in `.kiro/steering/automation-principles.md`. The ones that get
violated most:

| Rule | Why |
| --- | --- |
| **Never sleep.** No `Thread.Sleep`, `time.sleep`, `waitForTimeout`, `Task.Delay` | Sleeps are the #1 source of flake and of slow suites. Wait on a condition. |
| **No selectors in test files** | A UI change should be a one-file fix, not a twelve-file fix. |
| **No assertions in page objects or clients** | Otherwise they cannot be reused in negative-path tests. |
| **Tests own their data, and clean it up** | Registered at creation so it runs even when the test fails mid-way. |
| **Design for parallel from test #1** | Retrofitting parallel safety never happens; by then the suite depends on shared state. |
| **Push tests down the pyramid** | A validation matrix belongs in API tests. The browser is for journeys. |
| **No secret in any file** | Env vars only. `.env` is gitignored, `.env.example` is committed. |
| **Retries are diagnostics, not fixes** | Max 1 in CI, and a retried-then-passed test is reported as flaky, not as a pass. |
| **Readability beats cleverness** | See below. |

### Readability beats cleverness

The rule: **a colleague new to the language should understand any test on the
first read.** In a repo with four languages, almost everyone is an outsider to
three of them.

| Avoid | Prefer |
| --- | --- |
| LINQ chains (C#), `Stream` chains (Java), nested comprehensions (Python), `filter().map().reduce()` (TS) | A `foreach` / `for` loop with a named result variable |
| `reduce` / `Aggregate` | A loop |
| `Optional` chains as control flow | A plain null check |
| Nested ternaries | `if` / `else` |
| Reflection, `dynamic`, metaclasses, decorators hiding control flow | Explicit code |
| A clever one-liner | Three plain statements |

One short call doing one obvious thing is fine anywhere:
`orders.Count(o => o.IsPaid)`. The rule targets **chains and nesting**, not the
existence of the feature. Never put a chain inside an assertion — compute the
value on its own line and name it, so the failure message shows a real value.

Per-language detail is in `.kiro/steering/<language>-testing.md`.

---

## Per-language approach

Same architecture everywhere. What differs is the idiom, and the specific trap
each ecosystem sets.

### C# / .NET

**Stack:** .NET 8 · NUnit 4 · Playwright for .NET · FluentAssertions · Refit ·
Bogus · Allure.NUnit · Testcontainers for .NET

```text
csharp/
├── AutomationFramework.sln
├── Directory.Build.props        warnings as errors, nullable enable
├── Directory.Packages.props     central version management
├── src/AutomationFramework.Core/{Support,Models,Pages,Clients,Flows}/
└── tests/AutomationFramework.{UiTests,ApiTests,ContractTests}/
```

```powershell
dotnet restore csharp/AutomationFramework.sln
dotnet format  csharp/AutomationFramework.sln --verify-no-changes
dotnet build   csharp/AutomationFramework.sln --no-restore
pwsh csharp/tests/AutomationFramework.UiTests/bin/Debug/net8.0/playwright.ps1 install --with-deps
dotnet test    csharp/AutomationFramework.sln --no-build --filter "Category=Smoke" --logger "junit;LogFilePath=reports/junit.xml"
```

**The .NET-specific approach:**

- Own the Playwright lifecycle in `Support/BrowserFactory` rather than
  inheriting `PageTest`. You need control over context options and tracing.
- One `IBrowser` per assembly, one `IBrowserContext` **per test**.
- Parallelism via `[assembly: Parallelizable]` + `LevelOfParallelism`. Any
  `static` mutable field in a fixture breaks it.
- All I/O is `async`. No `async void`, no `.Result`, no `.Wait()`.
- `Assertions.Expect(locator)` for UI state (auto-retries); FluentAssertions
  for plain values and models.
- Refit declares the contract; a thin wrapper returns status + body so negative
  tests don't need try/catch.

**The trap:** static state in fixtures. It works single-threaded and fails
silently in parallel. Also: LINQ. Keep it out of tests.

### Java

**Built and green on `framework/java`** — 33 tests in ~28s. The module's own
README covers how to run it, the parts worth reading first, and three findings
from building it.

**Stack:** JDK 17 · Maven · JUnit 5 · Playwright for Java · REST Assured ·
AssertJ · Jackson · Datafaker · Allure · Testcontainers · SLF4J + Logback

```text
java/
├── pom.xml                      BOM-managed versions, Spotless, Error Prone
├── src/main/java/.../{support,models,pages,clients,flows}/
└── src/test/java/.../{ui,api,contract}/
    src/test/resources/junit-platform.properties
```

```powershell
mvn -f java/pom.xml spotless:check
mvn -f java/pom.xml verify -DskipTests
mvn -f java/pom.xml exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
mvn -f java/pom.xml test -Dgroups=smoke -Denv=local
```

**The JVM-specific approach:**

- Prefer JUnit 5 **`Extension`s** over base-class hierarchies:
  `BrowserExtension`, `FailureArtifactExtension` (a `TestWatcher`),
  `MdcExtension`. One thin base class per test type is the limit.
- With parallel execution on, **every Playwright object must be
  `ThreadLocal`**. Creating `Playwright.create()` per test costs seconds; a
  shared non-`ThreadLocal` `Page` costs your weekend.
- MDC carries the test name and correlation id so parallel logs stay separable.
  Clear it in teardown.
- REST Assured: build one `RequestSpecification` in `support/` and reuse it.
  Extract into records and assert with AssertJ — never chain
  `body("a.b.c", equalTo(...))` for business rules.
- Surefire already writes JUnit XML. No converter needed.

**The trap:** `ThreadLocal` leaks. Always `remove()` in teardown. Also:
`Optional` chains and `Stream` pipelines. Use null checks and loops.

### Python

**Stack:** CPython 3.12 · uv · pytest 8 · Playwright for Python · httpx ·
Pydantic v2 · Faker · pytest-xdist · allure-pytest · Ruff · mypy (strict)

```text
python/
├── pyproject.toml               strict markers, xfail_strict, ruff, mypy
├── conftest.py                  cross-suite fixtures only
├── src/framework/{support,models,pages,clients,flows}/
└── tests/{ui,api,contract}/     each with its own conftest.py
```

```powershell
uv sync --directory python
uv run --directory python ruff check . ; uv run --directory python ruff format --check .
uv run --directory python mypy src tests
uv run --directory python playwright install --with-deps
uv run --directory python pytest -m smoke -n auto --junitxml=reports/junit.xml
```

**The Python-specific approach:**

- `src/` layout, package installed editable by `uv sync`. **No `sys.path`
  manipulation, ever.**
- Fixtures are the whole design. Name them for what they provide
  (`authenticated_user`), scope them deliberately, always `yield` + teardown.
  Push each fixture to the nearest `conftest.py`.
- `--strict-markers` and `xfail_strict = true` are mandatory: they turn a typo
  and a silently-passing xfail into failures.
- Sync Playwright API by default. Simpler, and pytest-native.
- Pydantic v2 for every response you assert on. `extra="forbid"` in contract
  tests catches a silently added field.
- `mypy --strict` with no `Any` in framework code.

**The trap:** with `pytest-xdist`, session fixtures run **once per worker**,
not once per run. Anything that must happen exactly once (auth, seed data)
needs a file-lock guard. Also: comprehensions beyond one level.

### TypeScript

**Stack:** Node 22 · pnpm · Playwright Test · Zod · `@faker-js/faker` ·
allure-playwright · ESLint + Prettier · strict TypeScript

```text
typescript/
├── playwright.config.ts         fullyParallel, retain-on-failure, UTC
├── tsconfig.json                strict + noUncheckedIndexedAccess
├── src/{support,models,pages,clients,flows}/
└── tests/{ui,api,contract}/
```

```powershell
pnpm --dir typescript install --frozen-lockfile
pnpm --dir typescript lint
pnpm --dir typescript typecheck
pnpm --dir typescript exec playwright install --with-deps
pnpm --dir typescript test:smoke
```

**The TS-specific approach:**

- **Fixtures, not `beforeEach`.** Compose with `test.extend` in
  `src/support/fixtures.ts`; every spec imports `test` and `expect` from there,
  never from `@playwright/test`.
- Authenticate once in a `setup` project, save `storageState`, reuse it. Test
  projects declare `dependencies: ['setup']`.
- `tsc --noEmit` is a **required** gate. Playwright transpiles without type
  checking, so without it type errors ship.
- Zod schemas define the models; `schema.parse()` on every response body. A
  parse failure is a real defect.
- Tag with the built-in option: `test('...', { tag: ['@smoke'] }, ...)`.
- `test.step` for logical phases — it makes traces and Allure readable.

**The trap:** a missing `await` on a Playwright call. It is the single largest
flake source in this stack and it fails silently. `no-floating-promises` and
`missing-playwright-await` are errors, not warnings. Also: `reduce`, and
`await` inside `map`.

---

## Setup

### Prerequisites

Install only what you need for your module.

| Tool | For | Check |
| --- | --- | --- |
| .NET 8 SDK | csharp | `dotnet --version` |
| JDK 17 + Maven | java | `java -version` ; `mvn -v` |
| Python 3.12 + uv | python | `uv --version` |
| Node 22 + pnpm | typescript | `node -v` ; `pnpm -v` |
| Docker Desktop | Testcontainers, GitHub MCP | `docker info` |

`uv`: https://docs.astral.sh/uv/getting-started/installation/

### The demo target

The modules run against the **Toolshop** demo application, a public sandbox
with a matching REST API — so the suites work out of the box with no local app
to stand up.

| | |
| --- | --- |
| UI | https://practicesoftwaretesting.com |
| API | https://api.practicesoftwaretesting.com |
| Auth | email + password → JWT from `POST /users/login` |
| Source | [testsmith-io/practice-software-testing](https://github.com/testsmith-io/practice-software-testing) |

It was chosen because it exercises the architecture properly rather than just
proving a browser opens: a real paginated API for seeding and contract tests, a
JWT flow, nested response objects, and a UI worth writing page objects for.

The schemas in `shared/contracts/` were **derived from live responses**, not
from a published spec — every field and status code was observed directly. See
[`shared/contracts/README.md`](shared/contracts/README.md), which also documents
two genuine inconsistencies in the demo API that the tests assert as-is rather
than tidying up.

To point a module at your own application instead, change
`shared/environments/local.json` or set `AF_UI_BASEURL` / `AF_API_BASEURL`.

### Environment

```powershell
Copy-Item .env.example .env
```

Fill in `.env`. It is gitignored. **Never commit a real credential** — not in
a config file, not in a fixture, not in a comment.

Config resolves lowest-to-highest: code defaults →
`shared/environments/<env>.json` → module config → `AF_*` environment
variables. It fails fast at startup naming every missing key, and never
defaults a base URL to production.

### MCP servers (optional but recommended)

```powershell
New-Item -ItemType Directory -Path .kiro\settings -Force
Copy-Item docs\mcp\mcp.json.example .kiro\settings\mcp.json
```

Then check the two absolute paths (in the `git` and `filesystem` args) and
reconnect from the MCP Server panel in Kiro. No restart needed.

`.kiro/settings/mcp.json` is **gitignored** because those paths are
machine-specific. The committed template is `docs/mcp/mcp.json.example` — edit
that one when you want to change the config for everyone.

Enabled with no credentials: **playwright** (live browser + accessibility tree
— this is the one that stops you guessing locators), **fetch**, **git**,
**time**. Disabled until you opt in: **github**, **atlassian**, **postman**,
**filesystem**.

Full notes, including the security rules, in [`docs/mcp/README.md`](docs/mcp/README.md).

---

## Working with Kiro

`.kiro/` is loaded automatically. You do not need to explain the architecture,
the naming conventions, or the readability rules in your prompt — those are
already in context.

### What is loaded when

| Type | Files | When |
| --- | --- | --- |
| Always-on steering | `product`, `structure`, `tech`, `automation-principles`, `test-data-and-secrets` | Every message |
| Language steering | `csharp-` / `java-` / `python-` / `typescript-testing` | When a file of that type is in context |
| Topic steering | `api-and-contract-testing`, `ui-testing`, `flaky-test-policy`, `reporting-and-observability`, `ci-cd-pipelines`, `mcp-tooling` | When your request matches the topic |
| Skills | 8, below | When your request matches, or invoked as `/skill-name` |

### The 8 skills

| Skill | Use it for |
| --- | --- |
| `scaffold-test-module` | Starting a module from scratch, or bootstrapping a missing layer |
| `test-plan-from-requirements` | Turning a ticket or spec into a layered test plan |
| `new-ui-test` | A browser test plus its page objects and fixtures |
| `new-api-test` | An API or contract test plus its client and models |
| `test-data-builder` | Builders, factories, seeding fixtures |
| `stabilize-flaky-test` | Diagnosing and fixing an intermittent failure |
| `review-test-code` | Reviewing a test, a PR, or auditing a suite |
| `ci-pipeline-setup` | Building or fixing the pipeline |

Invoke explicitly with `/scaffold-test-module`, or just describe the task and
the matching skill activates on its own.

### Step by step: the eight workflows

Copy a prompt, replace the `<angle brackets>`, send it.

---

#### 1. Bootstrap a new module

**When:** the language folder is empty or missing.

```text
/scaffold-test-module

Set up the <python> module.

- App under test: <https://app.example.com>, API at <https://api.example.com>
- Auth: <OAuth client credentials / form login / API key header>
- Test types: <UI and API>
- Backing services: <none / Postgres via Testcontainers>

Build the support layer first, then one vertical slice: one model, one builder,
one client method, one page object, one flow, one API test and one UI test both
tagged smoke. Verify by running lint, typecheck, build, and the smoke suite,
then break one assertion to prove the failure artifacts attach, and restore it.
```

**What you get back:** the folder structure, the support layer (config, run
context, redaction, logging, timeouts, browser lifecycle, failure artifacts,
reporting), quality gates wired up, a working example of each layer, and a
report of what was verified.

**Expect to be asked:** how auth works. It shapes the whole support layer, and
it is the one thing that cannot be guessed.

---

#### 2. Plan coverage before writing tests

**When:** you have a ticket, a story, or an API spec. Do this **before** asking
for tests — it is the cheapest place to find gaps.

```text
/test-plan-from-requirements

Build a test plan for <ORD-142>.

<paste the ticket, acceptance criteria, or API spec here>

Assign every case to unit, API, or UI, and tell me which cases you would not
automate and why.
```

**What you get back:** testable statements, **open questions where the
requirement is ambiguous**, a risk ranking, a case table (case, technique,
level, suite, data, expected, priority), what is deliberately not automated,
prerequisites, and the estimated runtime impact.

**Read the open questions first.** Ambiguity found here costs minutes;
found in production it costs days.

With the Atlassian MCP server enabled you can skip the paste:

```text
/test-plan-from-requirements  Read Jira issue ORD-142 and build the test plan.
```

---

#### 3. Add a UI test

**When:** the behaviour genuinely needs a browser.

```text
/new-ui-test

Add a UI test to the <typescript> module.

- Requirement: <ORD-142>
- Precondition: <a customer with a saved expired card exists>
- Actor: <standard customer role>
- Action: <submit payment on the checkout page>
- Expected: <the page shows "Your card has expired." and no order is created>
- Cleanup: <delete the customer and any draft order>

Seed the precondition through the API, not the UI. Explore the checkout page
with the Playwright MCP server first and build the locators from the real
accessibility tree.
```

**What you get back:** the API seeding, the page object with real locators, a
flow if the sequence is reusable, the test, and evidence: 10 consecutive runs
plus one parallel run plus a verified failure path.

**Expect pushback** if the request is better served at the API level. A
20-case validation matrix through a browser will get you a counter-proposal:
one UI happy path plus API tests for the matrix. That is the steering working
as intended, not the agent being difficult.

---

#### 4. Add an API or contract test

```text
/new-api-test

Add API tests for <POST /orders> in the <java> module.

Contract: <shared/contracts/orders.yaml> — or paste the spec.

Cover the happy path plus the full negative matrix, including the cross-tenant
access case. Assert status, body, contract-bearing headers, and the side effect.
```

**What you get back:** models, the client method (returns status + body, throws
on nothing), the happy path asserting all four things, and the negative matrix:
400 / 401 / 403 / 404 / 409 / 415 / 429, boundary values, error-shape
assertions, plus idempotency and pagination where the contract defines them.

**The one to never skip:** cross-tenant access. Create as tenant A, read as
tenant B, assert denial. It is the most commonly missed high-severity gap.

---

#### 5. Clean up test data

**When:** you see constructor calls with six positional literals, or
`"test@test.com"` scattered around.

```text
/test-data-builder

Add a builder for <Order> in the <csharp> module, with named invalid variants
for <expired card>, <negative quantity>, and <missing shipping address>.

Then refactor <tests/ApiTests/OrderTests.cs> to use it and remove the inline
literals.
```

**What you get back:** a plain class — no LINQ, no annotation processors, no
nested record copying — valid by default, immutable so parallel tests cannot
interfere, unique values from the run id, seeded faker, and named invalid
states so negative tests read as clearly as positive ones.

---

#### 6. Fix a flaky test

**When:** a test passes sometimes. Do **not** ask for a retry.

```text
/stabilize-flaky-test

<tests/ui/checkout.spec.ts> "rejects payment when the card has expired" fails
about <1 run in 5> in CI and never locally.

<paste the failure output, or point at the CI run / trace>

Classify the root cause, reproduce it deliberately, fix the cause, and prove
it with repeated runs under the condition that reproduced it.
```

**What you get back:** a **classification** (race, shared data, order
dependency, unstable locator, eventual consistency, resource exhaustion, time
dependency…), the command that reproduces it on demand, a fix targeting the
cause, and 50 consecutive green runs under that condition as evidence.

**What you will not get:** a sleep, a raised timeout, a per-test retry, or a
try/catch. If it genuinely cannot be fixed now you get a time-boxed
quarantine with an owner, a ticket, and a 14-day expiry.

---

#### 7. Review test code

```text
/review-test-code

Review <the changes on this branch / typescript/tests/ui/checkout.spec.ts>.
```

**What you get back:** findings ordered by severity — Blocker, Major, Minor,
Note — each with file and line, the consequence, and the concrete fix. Plus
**the missing tests**, not just the flawed ones: absent negative paths, absent
cross-tenant checks, absent cleanup. Plus a note of what was actually verified
by running.

---

#### 8. Set up or fix CI

```text
/ci-pipeline-setup

Create a <GitHub Actions> workflow that runs all four modules.

Gate on lint, build, contract + API smoke, and UI smoke, under 15 minutes
total. Full regression on main. Cross-browser and a11y nightly.
```

For a CI-only failure:

```text
/ci-pipeline-setup

The <typescript> smoke suite passes locally and fails in CI.
<paste the CI log, or point at the run>
```

**What you get back for the debug case:** the causes worked through in order of
likelihood — browser/library version mismatch first, then worker count, then
missing config, then timezone, then a real race the local sleep was hiding.

---

### Prompting tips

**Give the outcome, not the implementation.** The steering already covers *how*.

| Weaker | Stronger |
| --- | --- |
| "Add a `data-testid` selector then click it and wait 3 seconds" | "Test that submitting an expired card shows the error and creates no order" |
| "Write tests for the checkout page" | "Requirement ORD-142. Precondition: customer with an expired saved card. Expected: 'Your card has expired.'" |
| "Fix this flaky test" | "Fails 1 in 5 in CI, never locally. Here is the trace." |
| "Make the pipeline faster" | "The PR gate takes 28 minutes. Budget is 15." |

**Say which module.** "Add an API test" in a four-language repo is ambiguous.

**Paste the real failure.** A trace, a log, a CI run link. Diagnosis from a
paraphrase is guesswork.

**Ask for the plan first on anything large.** "Plan this, do not write code
yet" gets you something reviewable before the tokens are spent.

**Expect to be corrected.** If you ask for a UI test for something an API test
covers better, or for a retry on a flaky test, you will get a counter-proposal
with a reason. Overrule it if you have context the steering does not — just say
so and it will proceed.

### Things Kiro will refuse or push back on

Not stubbornness — these are in the steering because each one has cost a team
a bad week:

- Adding a sleep, or raising a timeout without evidence.
- Adding a per-test retry to make a flaky test green.
- Writing a credential into any file.
- Wrapping a step in try/catch or a conditional so both outcomes pass.
- A 40-case validation matrix driven through a browser.
- Skipping cleanup, or registering it after the act.
- Committing a test with no assertion or no requirement link.

### Updating the rules

The standards are files, not firmware. If a rule is wrong for your context:

```text
Update .kiro/steering/typescript-testing.md: we use Vitest for unit tests
alongside Playwright, so add the conventions for it.
```

Architectural changes get an ADR in `docs/decisions/`.

---

## Definition of done

A change is done when all of these hold. This is the same list the agent
checks against.

- [ ] Runs green locally with one documented command
- [ ] Runs green headless, in parallel, on a clean machine
- [ ] Produces JUnit XML **and** Allure output
- [ ] Failure path verified once — artifacts attach and the message is readable
- [ ] No secret in any file; no unmasked secret in any log or attachment
- [ ] Lint, format, and type check clean
- [ ] Lock file committed, exact versions
- [ ] Requirement or ticket linked on every test
- [ ] Cross-module parity preserved, or the divergence recorded in an ADR

---

## Reference

| Topic | File |
| --- | --- |
| Core principles | `.kiro/steering/automation-principles.md` |
| Repo structure | `.kiro/steering/structure.md` |
| Stacks and commands | `.kiro/steering/tech.md` |
| Secrets and test data | `.kiro/steering/test-data-and-secrets.md` |
| Per-language conventions | `.kiro/steering/<language>-testing.md` |
| API and contract testing | `.kiro/steering/api-and-contract-testing.md` |
| UI testing | `.kiro/steering/ui-testing.md` |
| Flaky test policy | `.kiro/steering/flaky-test-policy.md` |
| Reporting | `.kiro/steering/reporting-and-observability.md` |
| CI/CD | `.kiro/steering/ci-cd-pipelines.md` |
| MCP servers | `docs/mcp/README.md` |
