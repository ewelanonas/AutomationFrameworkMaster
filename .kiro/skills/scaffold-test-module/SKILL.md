---
name: scaffold-test-module
description: Scaffold a new automation module or bootstrap a missing layer in an existing one for C#, Java, Python, or TypeScript. Creates the five-layer structure, config loading, browser/driver lifecycle, reporting hooks, lint gates, and a working example test. Use when starting a module from scratch, adding a language to the repo, or when asked to set up or bootstrap a test framework.
---

# Scaffold a Test Automation Module

Produce a module that runs green with one command, in parallel, headless, with
reports, on a clean machine. Anything less is not done.

## Step 1 — Confirm the target before writing files

Establish these. Ask only if you cannot infer them from the repo or the
request; otherwise pick the documented default and say what you picked.

| Question              | Default                                     |
| --------------------- | ------------------------------------------- |
| Language / module     | required — must be one of the four          |
| Test types            | UI + API                                    |
| Target app URL(s)     | from `shared/environments/local.json`       |
| Auth mechanism        | ask — it shapes the whole support layer      |
| Backing services      | none; add Testcontainers if the app needs a DB |
| Existing module?      | check the filesystem first, never overwrite |

Read `.kiro/steering/tech.md` for pinned versions and `structure.md` for the
layout. Do not invent a different stack.

## Step 2 — Create the structure

Every module gets exactly these layers, using the per-language naming in
`structure.md`:

```text
<module>/
├── <manifest>              # csproj/sln, pom.xml, pyproject.toml, package.json
├── src/ (or equivalent)
│   ├── support/            config, driver lifecycle, waits, redaction, run context, reporting hooks
│   ├── models/             typed DTOs
│   ├── pages/              page + component objects
│   ├── clients/            API clients
│   └── flows/              business actions
├── tests/                  ui/ api/ contract/
├── .env.example
└── README.md               how to run, in three commands
```

Create the folders even when empty, with a `.gitkeep`, so the shape is obvious
to the next engineer.

## Step 3 — Build the support layer first

This is the part that determines whether the suite is stable. In order:

1. **Run context** — generate a run id at startup, expose it, log it. Every
   generated name and correlation id derives from it.
2. **Config** — layered resolution (defaults → `shared/environments/<env>.json`
   → `AF_*` env vars), typed, validated at startup, failing with the list of
   missing keys. Never default a base URL to production.
3. **Redaction** — a single function every logger and report attachment calls.
   Write this before the logging, not after.
4. **Logging** — structured, per-test context so parallel output stays
   separable.
5. **Timeout policy** — named timeouts (element/navigation/workflow) read from
   config. No millisecond literals anywhere else.
6. **Browser or driver lifecycle** — one browser per process, one context and
   page per test, disposed in teardown.
7. **Failure artifact hook** — a listener/watcher/fixture that on failure
   captures screenshot, HTML, trace, console errors, and the correlation id,
   and attaches them to the report.
8. **Reporting** — Allure plus JUnit XML wired into the runner config.
9. **Auth** — obtain a token via API once per run, save storage state, reuse.

## Step 4 — Add the quality gates

The module is not scaffolded until these run and pass:

- Formatter and linter with the project's rules, failing on violation.
- Type check as a separate step where the runner does not type check
  (`tsc --noEmit`, `mypy --strict`).
- Compiler warnings as errors.
- Parallel execution enabled in the runner config.
- Lock file committed, exact versions, no floating ranges.
- `.gitignore` covering `.env`, key/cert files, `reports/`, build output.

## Step 5 — One example of each layer

Write a small vertical slice that exercises the whole stack, not a
`HelloWorldTest`:

- One model with validation.
- One builder producing a valid default.
- One API client method.
- One page object with two locators and one action.
- One flow composing them.
- One API test and one UI test, both tagged `smoke`.

The example is documentation. It is what everyone will copy, so it must be
exemplary: no sleeps, no selectors in tests, no assertions in page objects.

Write it in the plainest form the language allows. Ordinary methods with
bodies, ordinary loops, named intermediate variables. No LINQ or stream chains,
no `reduce`, no reflection, no clever generics. The first reader of this module
may not be fluent in its language, and whatever style the example uses is the
style the whole suite will inherit.

## Step 6 — Verify, then report

Run, in this order, and fix what fails:

1. Install / restore dependencies.
2. Lint + format check.
3. Type check.
4. Build.
5. Install browsers with the matching Playwright version.
6. Run the smoke suite headless, in parallel.
7. Confirm `reports/junit.xml` and Allure results exist and are non-empty.
8. Deliberately break one assertion, re-run, confirm the failure artifacts and
   report entry appear, then restore it.

Step 8 is not optional. A failure pipeline that has never seen a failure does
not work.

Then report: what was created, the exact commands to run it, what you verified,
and anything you could not verify with a reason.

## Language-specific setup

Load only the one you need:

- C# / .NET → `references/csharp.md`
- Java → `references/java.md`
- Python → `references/python.md`
- TypeScript → `references/typescript.md`

## Do not

- Copy a recorder-generated project as the starting point.
- Add a second assertion library, HTTP client, or reporter alongside the
  chosen one.
- Put credentials in a config file "temporarily".
- Skip parallel setup with a plan to enable it later. It never gets enabled,
  and by then the suite depends on shared state.
- Declare success on a build that compiled but ran no tests.
