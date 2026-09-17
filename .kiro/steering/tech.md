---
inclusion: always
---

# Tech Stack and Commands

Pinned, opinionated choices. Do not introduce an alternative library for a
job that already has one here without an ADR in `docs/decisions/`.

## Chosen stacks

| Concern            | C# / .NET                        | Java                          | Python                     | TypeScript                  |
| ------------------ | -------------------------------- | ----------------------------- | -------------------------- | --------------------------- |
| Runtime            | .NET 8 (LTS)                     | JDK 17 (LTS)                  | CPython 3.12               | Node.js 22 (LTS)            |
| Build / deps       | `dotnet` + NuGet, central pkg mgmt | Maven                       | `uv` + `pyproject.toml`    | `pnpm`                      |
| Test runner        | NUnit 4                          | JUnit 5 (Jupiter)             | pytest 8                   | Playwright Test             |
| UI driver          | Playwright for .NET              | Playwright for Java           | Playwright for Python      | Playwright                  |
| API client         | `HttpClient` (see ADR 0003)      | REST Assured                  | `httpx`                    | Playwright `APIRequestContext` |
| Assertions         | AwesomeAssertions (see ADR 0002) | AssertJ                       | plain `assert` + pytest    | Playwright `expect`         |
| Data models        | records + System.Text.Json       | records + Jackson             | Pydantic v2                | Zod                         |
| Fake data          | Bogus                            | Datafaker                     | Faker                      | `@faker-js/faker`           |
| Parallelism        | NUnit `[Parallelizable]`         | JUnit parallel execution      | `pytest-xdist`             | Playwright workers          |
| Human report       | Allure (`Allure.NUnit`)          | Allure (`allure-junit5`)      | `allure-pytest`            | `allure-playwright`         |
| CI report          | `--logger trx` + JUnit converter | Surefire XML                  | `--junitxml`               | `junit` reporter            |
| Lint / format      | `dotnet format`, analyzers as errors | Spotless + Error Prone    | Ruff + mypy (strict)       | ESLint + Prettier + `tsc --noEmit` |
| Containers         | Testcontainers for .NET          | Testcontainers                | `testcontainers[python]`   | `testcontainers`            |

Allure is the single human-facing report format across all four modules so one
CI job can publish one combined report.

### Two C# choices that carry a reason

**Assertions: AwesomeAssertions, never FluentAssertions 8+.** FluentAssertions
moved to a paid licence for commercial use at version 8.0; 7.x stays Apache-2.0
but is frozen to bugfixes. AwesomeAssertions is the MIT fork of 7.x with a
compatible API. Naming the library without a version — as this table originally
did — quietly points every `dotnet add package` at a paid dependency. See
`docs/decisions/0002-assertion-library-licensing.md`.

**API client: plain `HttpClient`, not Refit.** A test client needs the raw status
and body on every call, and negative tests deliberately send payloads a generated
interface is designed to prevent. See
`docs/decisions/0003-httpclient-over-refit.md`.

## Canonical commands

Always prefer these. If a command below does not work, fix the module rather
than inventing a new command.

### C#

```powershell
dotnet restore csharp/AutomationFramework.sln
dotnet build csharp/AutomationFramework.sln --no-restore -warnaserror
dotnet test  csharp/AutomationFramework.sln --no-build --filter "Category=Smoke" --logger "trx;LogFileName=results.trx"
dotnet format csharp/AutomationFramework.sln --verify-no-changes
pwsh csharp/tests/AutomationFramework.UiTests/bin/Debug/net8.0/playwright.ps1 install --with-deps
```

### Java

```powershell
mvn -f java/pom.xml verify -DskipTests
mvn -f java/pom.xml test -Dgroups=smoke -Denv=dev
mvn -f java/pom.xml spotless:check
mvn -f java/pom.xml exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
```

### Python

```powershell
uv sync --directory python
uv run --directory python pytest -m smoke -n auto --junitxml=reports/junit.xml
uv run --directory python ruff check . ; uv run --directory python ruff format --check .
uv run --directory python mypy src tests
uv run --directory python playwright install --with-deps
```

### TypeScript

```powershell
pnpm --dir typescript install --frozen-lockfile
pnpm --dir typescript exec playwright install --with-deps
pnpm --dir typescript test -- --grep @smoke
pnpm --dir typescript lint ; pnpm --dir typescript exec tsc --noEmit
```

## Shell notes for this repo

Windows + PowerShell is the primary local shell.

- Use `;` as the separator, never `&&`.
- Environment variables are `$env:NAME`, never `%NAME%`.
- Never launch a watch mode or a UI runner (`--ui`, `--watch`, `--headed`
  interactive) from an agent-run command; those block. Tell the user the
  command to run instead.
- Use `--run`-style single-shot flags for anything that defaults to watching.

## Version discipline

- Pin exact versions in lock files (`packages.lock.json`, `pom.xml` with a
  parent-managed BOM, `uv.lock`, `pnpm-lock.yaml`). Commit all lock files.
- No floating ranges (`^`, `~`, `LATEST`, `RELEASE`, `*`) in manifests.
- Browser binary versions come from the Playwright version. Never mix a
  Playwright library version with a mismatched browser install step.
- Bump dependencies in a dedicated PR that touches nothing else.
