---
inclusion: always
---

# Product: AutomationFrameworkMaster

## What this repository is

A polyglot **test automation framework master repository**. It hosts four
independent but architecturally identical automation stacks:

| Module       | Language   | Purpose                                                        |
| ------------ | ---------- | -------------------------------------------------------------- |
| `csharp/`    | C# / .NET  | Automation for .NET-facing products and Windows-hosted services |
| `java/`      | Java       | Automation for JVM services and enterprise web apps            |
| `python/`    | Python     | Automation for data/ML services and fast exploratory suites     |
| `typescript/`| TypeScript | Automation for web front ends and Node/BFF services            |

Each module is a **reference implementation** teams can copy into a product
repository. That makes consistency across modules a first-class requirement:
if a concept exists in one module, it should exist in all four with the same
name and the same responsibilities.

## Who uses it

- **QA / SDET engineers** writing UI, API, and contract tests.
- **Developers** running the suites locally before merging.
- **Platform / CI engineers** wiring the suites into pipelines.

## Non-goals

- This repo is not the product under test. Never add production application
  code here.
- Not a place for one-off throwaway scripts. Anything committed must be
  runnable by CI and by another engineer without tribal knowledge.
- Not a single "universal" abstraction layer. The four modules do not share
  runtime code, only shared **contracts and test data** under `shared/`.

## Success criteria for any change

A change is done when all of the following hold:

1. It runs green locally with a single documented command.
2. It runs green in CI in headless mode, in parallel, on a clean machine.
3. It produces a machine-readable report (JUnit XML) plus a human report.
4. It does not require a secret to be committed or a hand-edited local file
   beyond a documented `.env.example` copy.
5. Cross-module parity is preserved, or the divergence is explicitly noted in
   `docs/decisions/`.

## Vocabulary (use these words consistently)

- **Suite** — a runnable grouping of tests selected by tag (`smoke`, `regression`, `contract`).
- **Test** — one independent scenario with one clear reason to fail.
- **Fixture** — setup/teardown that provides a resource to a test.
- **Page object / component object** — UI interaction wrapper, no assertions.
- **Client** — API interaction wrapper, no assertions.
- **Builder / factory** — produces test data objects.
- **Environment** — a named target (`local`, `dev`, `staging`) resolved from config.
