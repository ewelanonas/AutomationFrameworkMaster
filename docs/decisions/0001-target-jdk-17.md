# 0001 — Target JDK 17 rather than JDK 21

- **Status:** Accepted
- **Date:** 2026-09-17
- **Applies to:** the `java/` module

## Context

`tech.md` originally specified JDK 21 as the JVM runtime. The environment the
framework is actually developed and run on is:

```text
java version "17.0.4.1" 2022-08-18 LTS
Apache Maven 3.8.6
```

Both 17 and 21 are LTS releases. A standard nobody's machine can build is not a
standard, it is a wish.

## Decision

Target **JDK 17** for the `java/` module. Set `maven.compiler.release=17`.

## Consequences

Nothing in the chosen stack needs 21:

| Feature used | Available since |
| --- | --- |
| `record` types for models and DTOs | 16 |
| Sealed types (not currently used) | 17 |
| Text blocks for JSON fixtures | 15 |
| Pattern matching for `instanceof` | 16 |
| Playwright for Java | 8 |
| JUnit 5, REST Assured, AssertJ, Jackson | 8 / 11 |

What is given up:

- **Virtual threads** (21). Irrelevant here: parallelism comes from the JUnit
  platform and from separate browser contexts, not from thread-per-task I/O.
- **Pattern matching for `switch`** (21). A plain `switch` or `if`/`else` is
  what the readability rule in `automation-principles.md` asks for anyway.
- **Sequenced collections** (21). Not needed.

## Upgrade path

Moving to 21 later is a two-line change plus a CI matrix bump:

1. `maven.compiler.release` in `java/pom.xml`
2. `java-version` in the CI workflow

No source change is expected. Revisit when the team's baseline JDK moves, or
when a dependency requires it.

## Alternatives considered

- **Keep the standard at 21 and require everyone to install it.** Rejected for
  now: it blocks the first build on an environment change that buys nothing the
  suite needs. Worth revisiting as a deliberate platform upgrade, not as a
  side effect of scaffolding a module.
- **Toolchains plugin to download JDK 21 automatically.** Adds a moving part
  and a first-build download to every machine and CI runner, for features the
  suite does not use.
