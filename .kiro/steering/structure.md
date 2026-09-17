---
inclusion: always
---

# Repository Structure

## Top level

```text
AutomationFrameworkMaster/
├── .kiro/
│   ├── steering/              # Agent context (this folder)
│   └── skills/                # On-demand agent workflows
├── csharp/                    # .NET automation module
├── java/                      # JVM automation module
├── python/                    # Python automation module
├── typescript/                # TypeScript automation module
├── shared/
│   ├── contracts/             # OpenAPI / JSON Schema / AsyncAPI specs
│   ├── testdata/              # Language-neutral fixtures (JSON, CSV)
│   └── environments/          # Non-secret env descriptors (URLs, timeouts)
├── docs/
│   ├── getting-started.md
│   └── decisions/             # ADRs: NNNN-short-title.md
├── .github/workflows/         # CI definitions
└── README.md
```

## The five-layer rule

Every module implements the same five layers. Code belongs in exactly one.
When you cannot decide where something goes, that is a signal the
responsibility is wrong, not that the rule is unclear.

```text
1. tests/        Scenarios. Arrange-act-assert. The ONLY place assertions live.
2. flows/        Multi-step business actions composed from pages/clients.
                 e.g. "checkout with a saved card". No assertions except
                 guard checks that a precondition was reached.
3. pages/        UI interaction wrappers (page objects, component objects).
   clients/      API/service interaction wrappers. Return typed models.
4. support/      Fixtures, hooks, driver/browser lifecycle, config loading,
                 waits, reporting hooks, test data builders.
5. models/       Data types: DTOs, enums, request/response shapes.
```

Dependency direction is strictly downward: `tests → flows → pages/clients →
support/models`. A page object must never import a test. `support/` must
never import `tests/`.

## Per-module layout

Same shape everywhere, with idiomatic per-language naming:

```text
csharp/
├── AutomationFramework.sln
├── src/AutomationFramework.Core/          # support, models, pages, clients
├── tests/AutomationFramework.UiTests/
├── tests/AutomationFramework.ApiTests/
└── Directory.Build.props

java/
├── pom.xml
├── src/main/java/.../{support,models,pages,clients,flows}/
└── src/test/java/.../{ui,api,contract}/

python/
├── pyproject.toml
├── src/framework/{support,models,pages,clients,flows}/
└── tests/{ui,api,contract}/
└── conftest.py

typescript/
├── package.json
├── playwright.config.ts
├── src/{support,models,pages,clients,flows}/
└── tests/{ui,api,contract}/
```

## Naming conventions

| Thing            | Pattern                          | Example                       |
| ---------------- | -------------------------------- | ----------------------------- |
| Test file        | `<Feature>` + language test idiom | `CheckoutTests.cs`, `test_checkout.py`, `checkout.spec.ts`, `CheckoutTest.java` |
| Test method      | `Should<Expected>_When<Condition>` (C#/Java), `test_<expected>_when_<condition>` (Py), `should ... when ...` (TS) | `ShouldRejectOrder_WhenCardExpired` |
| Page object      | `<Screen>Page`                    | `CheckoutPage`                |
| Component object | `<Widget>Component`               | `CartSummaryComponent`        |
| API client       | `<Resource>Client`                | `OrdersClient`                |
| Builder          | `<Model>Builder`                  | `CustomerBuilder`             |
| Fixture          | intent, not mechanism             | `authenticated_user`, not `setup2` |

## Where to put new files

- New UI screen → `pages/`, plus locators in the same class, never in tests.
- New endpoint wrapper → `clients/`.
- Reusable multi-step action used by 2+ tests → `flows/`.
- New shared JSON payload used by more than one language → `shared/testdata/`.
- New environment target → `shared/environments/<name>.json` (URLs and
  timeouts only, never credentials).
- Architectural change → an ADR in `docs/decisions/`.
