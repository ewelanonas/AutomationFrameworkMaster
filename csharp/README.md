# C# / .NET Automation Module

A working test automation framework for .NET, running against the
[Toolshop](https://practicesoftwaretesting.com) demo application.

**34 tests, green, in about 12 seconds**, two workers in parallel, headless,
producing TRX, JUnit XML and Allure output.

Branch: `framework/csharp`. Shared standards and contracts live on `main` — see
the [root README](../README.md#branching-model).

---

## Run it

```powershell
# from the repository root
dotnet build csharp/AutomationFramework.sln
dotnet test  csharp/AutomationFramework.sln --no-build
```

No credentials to configure. Every test that needs an account registers its own
over the API — see [finding 2](#2-a-shared-test-account-is-shared-mutable-state).

Browsers install themselves on first run. `pwsh` is **not** required; see
[finding 5](#5-playwright-for-net-does-not-download-its-own-browsers).

### Suite selection

Categories, never file paths — paths drift.

```powershell
dotnet test csharp/AutomationFramework.sln --no-build --filter "Category=Smoke"
dotnet test csharp/AutomationFramework.sln --no-build --filter "Category=Regression"
dotnet test csharp/AutomationFramework.sln --no-build --filter "Category=Contract"
dotnet test csharp/AutomationFramework.sln --no-build --filter "Category!=Destructive"
dotnet test csharp/AutomationFramework.sln --no-build --filter "FullyQualifiedName~AuthApiTests"
```

### Useful switches

| Switch | Effect |
| --- | --- |
| `$env:AF_ENV='dev'` | Selects `shared/environments/dev.json` |
| `$env:AF_HEADLESS='false'` | Watch the browser. Run it yourself; it blocks. |
| `$env:AF_DATA_SEED=<n>` | Reproduce a run's generated data exactly |
| `$env:AF_RUN_ID=<id>` | Reuse a run id, to target data a previous run created |
| `$env:AF_SKIP_BROWSER_INSTALL='true'` | Skip the install check in CI, where the browser is cached |

### Reports

```powershell
dotnet test csharp/AutomationFramework.sln --no-build `
  --logger "trx;LogFileName=results.trx" `
  --logger "junit;LogFilePath=junit.xml"
```

| Output | Where |
| --- | --- |
| TRX | `csharp/TestResults/results.trx` |
| JUnit XML | `csharp/tests/AutomationFramework.Tests/junit.xml` — the logger ignores `--results-directory` |
| Allure results | `csharp/tests/AutomationFramework.Tests/bin/Debug/net8.0/allure-results/` |
| Failure artifacts | `csharp/TestResults/failure-artifacts/<runId>/<test>/` |

```powershell
npx playwright show-trace csharp/TestResults/failure-artifacts/<runId>/<test>/trace.zip
```

Traces, screenshots and page HTML are written **on failure only**.

---

## Layout

```text
csharp/
├── AutomationFramework.sln
├── global.json                     SDK pinned to 8.0.424
├── Directory.Build.props           net8.0, nullable, warnings as errors
├── Directory.Packages.props        every version, centrally managed
├── .editorconfig                   analyzer severities, with reasons
├── src/AutomationFramework.Core/
│   ├── Support/       RepoPaths, RunContext, Redaction, AppConfig, ConfigLoader,
│   │                  TestLog, PlaywrightFactory, BrowserInstaller, Navigation,
│   │                  ApiHttp, RedactingHttpHandler, SchemaValidator, TestValues,
│   │                  ConsoleErrorPolicy
│   ├── Models/        Product, ProductSpec, ProductImage, Category, Brand,
│   │                  PagedProducts, LoginRequest, LoginResponse, RegisterRequest,
│   │                  TestAccount, ApiError
│   ├── Clients/       ApiResult, AuthClient, ProductsClient, UsersClient
│   ├── Pages/         HomePage, ProductDetailPage, LoginPage, AccountPage
│   └── Flows/         AuthFlow, AccountFlow
└── tests/AutomationFramework.Tests/
    ├── AssemblyInfo.cs   parallelism and fixture lifecycle
    ├── GlobalSetup.cs    one-time setup, in one method on purpose
    ├── ApiTestBase.cs  UiTestBase.cs
    ├── Api/           ProductCatalogueApiTests (11), AuthApiTests (8)
    ├── Contract/      ToolshopContractTests (6)
    └── Ui/            ProductBrowsingTests (5), SignInTests (4)
```

Dependencies point downward only: `tests → flows → pages/clients →
support/models`.

---

## Six findings from building this

The C# module was harder to get green than the Java one, and every difficulty
was instructive. These are the reasons the house rules exist, discovered rather
than recited.

### 1. `FixtureLifeCycle` is not optional, and its absence looks like anything else

By default NUnit creates **one** instance of a fixture and runs every test
method on it. With `[Parallelizable(ParallelScope.All)]` that means concurrent
tests share the fixture's instance fields — so `UiTestBase._page` and `._context`
were being overwritten, and then set to `null`, by whichever sibling finished
first.

It presented as `TargetClosedException`, `net::ERR_ABORTED`, and eventually a
null `Page`. None of those look like a lifecycle problem, and I chased the
network and the browser first.

```csharp
[assembly: FixtureLifeCycle(LifeCycle.InstancePerTestCase)]
```

The Java module configures the same thing with
`junit.jupiter.testinstance.lifecycle.default = per_method`. Cross-module parity
would have caught this on day one — it is exactly the kind of gap the parity
requirement in `product.md` exists to prevent.

### 2. A shared test account is shared mutable state

The negative sign-in tests send a wrong password on purpose. That increments a
server-side failed-attempt counter, and after enough runs the demo API started
answering **`423 Locked`** to *every* login — including happy paths, in **both**
language modules at once:

```json
{"error":"Account locked, too many failed attempts. Please contact the administrator."}
```

Not an application bug. A test-design defect, and one the house rules name
directly: *shared user accounts mutated by tests*.

The fix is `AccountFlow.CreateCustomerAsync()`, which registers a throwaway
account over the API. A per-test account can be locked, abused, or left in any
state, because nothing else will ever use it. As a side effect the suite now
needs **no credentials configured at all**.

The lockout itself is now asserted deliberately — behaviour a suite can break
itself on is behaviour worth a test — tagged `Destructive` so it stays out of
routine runs.

### 3. Lazily creating Playwright inside an async `[SetUp]` deadlocks

`Playwright.CreateAsync()` on first use inside a test's `async Task [SetUp]`
hung the entire run with **no output at all** — not even a test name. It looked
like a broken environment, not a deadlock.

NUnit's async adapter blocks the worker thread without pumping a message loop,
while Playwright has internal continuations that post back to the captured
`SynchronizationContext`. Those continuations never run.

The fix is eager creation in `[OneTimeSetUp]`, wrapped in `Task.Run` so the work
is detached from any ambient synchronization context. It also stops four workers
racing an expensive driver start-up.

### 4. One timeout policy is only one policy if everything reads from it

`SetDefaultTimeout` on the context does **not** affect Playwright's web-first
assertions. They keep their own, and stayed on the built-in 5s while config asked
for 10s:

```text
Expect "ToHaveURLAsync" with timeout 5000ms
  - unexpected value "https://practicesoftwaretesting.com/auth/login"
```

Fixed with `Assertions.SetDefaultExpectTimeout(...)` in setup — and then broken
again briefly, because I had split `[OneTimeSetUp]` across two methods and
**NUnit does not guarantee their order**, so the browser was sometimes created
before the timeout was applied. They are one method now.

### 5. Playwright for .NET does not download its own browsers

Unlike the Java and Python bindings. The documented route is
`pwsh playwright.ps1 install`, which needs PowerShell 7 installed separately —
and it was not present on this machine.

`BrowserInstaller` calls `Microsoft.Playwright.Program.Main(["install", browser])`
instead, which is the same entry point that script uses. No external shell, and a
no-op once the browser is present.

### 6. Fewer workers ran the suite three times faster

At four workers against the free public sandbox, the suite drew
`ERR_CONNECTION_RESET`, SSL handshake failures and navigation timeouts — five
failures that were entirely the suite's own load. At **two** workers: 34/34 green,
and the wall clock went from **35s to 12s**.

More parallelism is not more throughput once the far end starts refusing you. The
`LevelOfParallelism` comment records why the number is what it is, so nobody
"optimises" it back.

---

## The parts worth reading first

### `ApiResult<T>` — clients never throw on non-2xx

A 403 test and a 200 test read identically and neither needs a `try`/`catch`. The
body is deserialized only on success, so an error response never fails for the
wrong reason and buries the real status code.

The response text is captured eagerly because an `HttpResponseMessage` content
stream can only be read once, and both the report attachment and the schema
validator need it.

### `RedactingHttpHandler` — a `DelegatingHandler`, not per-call logging

It sees every call the client makes, so no client method can forget to log.
Everything passes through `Redaction` first: sensitive headers and JSON fields by
name, JWT and card-shaped strings by pattern.

`LoginRequest`, `LoginResponse` and `RegisterRequest` also override `ToString()`,
because a record's generated one prints every property — including the password
and the token — and would defeat redaction from the inside.

### `SchemaValidator` — `FromFile` has a side effect

`JsonSchema.FromFile` registers the schema in a global registry under its own
file URI. Calling it twice for the same file throws *"Overwriting registered
schemas is not permitted"*, which is what my first version did.

That same automatic registration is what makes the relative `$ref` from
`toolshop-paged-products` to `toolshop-product` resolve. Loading the folder
exactly once satisfies both constraints.

These are the **same shared schemas** the Java module validates, with a different
library. Agreeing on the schema rather than on a validator is what makes the
contract shared rather than duplicated.

### `AwesomeAssertions`, not FluentAssertions

FluentAssertions 8.0 moved from Apache-2.0 to a licence requiring a **paid seat
for commercial use**. Version 7.x stays Apache-2.0 but is frozen to bugfixes.
AwesomeAssertions is the MIT community fork of 7.x with a compatible API.

See [`docs/decisions/0002-assertion-library-licensing.md`](../docs/decisions/0002-assertion-library-licensing.md).
This is a decision worth reviewing rather than inheriting.

### Plain `HttpClient`, not Refit

See [`docs/decisions/0003-httpclient-over-refit.md`](../docs/decisions/0003-httpclient-over-refit.md).

---

## Operational notes

**A killed or hung test run leaves `testhost` processes holding the output DLLs**,
and the next build fails with `MSB3027 ... locked by: testhost`. Clear them:

```powershell
Get-Process testhost -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Do not edit source with shell text pipelines.** A `Get-Content | .Replace | Set-Content`
one-liner emptied `AuthFlow.cs` during this build. The same habit also left a UTF-8
BOM on nine files — PowerShell's `Set-Content -Encoding UTF8` writes one — which
`dotnet format` rejects as `error CHARSET`. Use an editor.

**`dotnet format --verify-no-changes` is a real gate, not a formality.** Wiring it
into CI found 49 problems on a module that built and tested clean: the nine BOMs
above, and 40 `IDE1006` violations caused by an over-broad naming rule in
`.editorconfig` that claimed `const` and `static readonly` fields, whose PascalCase
names were correct all along. .NET applies the **first** matching naming rule, so
specific rules have to be declared before general ones.

---

## Known gaps

- **No `.github/workflows/`.** Nothing runs this in CI yet.
- **Registered accounts are never deleted.** The demo API offers no self-delete.
  Every address is on `example.invalid` with the run id embedded so a janitor can
  find them; a real project registers cleanup at creation time.
- **No Allure step structure.** The bare `AllureApi.Step(name)` overload starts a
  step nothing closes, and calling it from a flow hung the suite. Flows log
  instead. The wrapping overload would restore it.
- **No cross-tenant test.** The demo has roles but not tenants.
- **No Testcontainers usage.** Nothing to stand up against a hosted demo.
- **Chromium only.** Firefox and WebKit belong in a scheduled job.
- **No accessibility scan and no visual tests.** Both deliberate for now.
