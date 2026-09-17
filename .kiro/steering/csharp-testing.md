---
inclusion: fileMatch
fileMatchPattern: ["csharp/**", "**/*.cs", "**/*.csproj", "**/*.sln", "**/Directory.Build.props", "**/Directory.Packages.props", "**/*.runsettings"]
---

# C# / .NET Automation Conventions

Stack: .NET 8, NUnit 4, Playwright for .NET, FluentAssertions, Refit,
Bogus, Allure.NUnit, Testcontainers for .NET.

## Project layout

```text
csharp/
├── AutomationFramework.sln
├── Directory.Build.props           # shared compiler settings
├── Directory.Packages.props        # central package version management
├── src/AutomationFramework.Core/
│   ├── Support/     Config, DriverFactory, Waits, Logging, Redaction
│   ├── Models/      records + JsonSerializerOptions
│   ├── Pages/       page + component objects
│   ├── Clients/     Refit interfaces + typed wrappers
│   └── Flows/       business actions
└── tests/
    ├── AutomationFramework.UiTests/
    ├── AutomationFramework.ApiTests/
    └── AutomationFramework.ContractTests/
```

`Directory.Build.props` must set:

```xml
<PropertyGroup>
  <TargetFramework>net8.0</TargetFramework>
  <Nullable>enable</Nullable>
  <ImplicitUsings>enable</ImplicitUsings>
  <LangVersion>latest</LangVersion>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  <AnalysisLevel>latest-recommended</AnalysisLevel>
</PropertyGroup>
```

Enable `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>`
and `RestorePackagesWithLockFile`. Commit `packages.lock.json`.

## Test structure

- One test class per feature, suffix `Tests`, inherit a shared base only for
  lifecycle, never for helper grab-bags.
- `[TestFixture]`, `[Parallelizable(ParallelScope.All)]` at assembly level via
  `[assembly: LevelOfParallelism(n)]` in `AssemblyInfo.cs`.
- Tag with `[Category("Smoke")]`, `[Category("Regression")]`,
  `[Category("Contract")]`. CI selects with `--filter "Category=Smoke"`.
- Method naming: `Should<ExpectedOutcome>_When<Condition>`.
- Data-driven: `[TestCase]` for literals, `[TestCaseSource]` for objects.
  Give every case a `SetName` so failures are identifiable in the report.
- `[Description]` carries the requirement/ticket reference.

```csharp
[TestFixture]
[Category("Regression")]
public sealed class CheckoutTests : UiTestBase
{
    [Test]
    [Description("ORD-142: expired cards must be rejected at payment")]
    public async Task ShouldRejectPayment_WhenCardIsExpired()
    {
        var customer = CustomerBuilder.Valid().WithExpiredCard().Build();
        await CheckoutFlow.StartAsync(customer);

        var error = await CheckoutPage.PaymentError.TextContentAsync();

        error.Should().Be("Your card has expired.");
    }
}
```

## Async rules

- All I/O is `async`. Test methods return `Task`, never `void`, never `.Result`
  or `.Wait()`.
- No `async void` anywhere.
- Use `ConfigureAwait` only in library code under `src/`, not in tests.
- `CancellationToken` flows from the config timeout policy into clients.

## Playwright for .NET

- Do not inherit `PageTest`/`PlaywrightTest` if you need custom parallel
  scoping; own the lifecycle in `Support/BrowserFactory` and expose `IPage`
  through the fixture.
- One `IBrowser` per assembly, one `IBrowserContext` **per test** for
  isolation. Never share a context across tests.
- Enable tracing per test, keep on failure only:

```csharp
await Context.Tracing.StartAsync(new() { Screenshots = true, Snapshots = true, Sources = true });
// ...
await Context.Tracing.StopAsync(new() { Path = failed ? tracePath : null });
```

- Locators: `Page.GetByTestId`, `GetByRole`, `GetByLabel`. Set
  `TestIdAttribute` once in setup.
- Assertions on UI state use `Assertions.Expect(locator)` (web-first,
  auto-retrying), not `FluentAssertions` on a snapshot value.
- Never `Page.WaitForTimeoutAsync`.

## API clients

- Declare the contract with a Refit interface; wrap it in a small typed client
  that returns `Result`-shaped responses so negative tests can inspect status
  codes without exceptions.
- One `HttpClient` per base address via `IHttpClientFactory`; never
  `new HttpClient()` per call.
- Add a `DelegatingHandler` for correlation id injection, request/response
  logging with redaction, and retry on transport faults only (never on 4xx).
- `System.Text.Json` with `JsonSerializerOptions` centrally configured;
  `PropertyNameCaseInsensitive = true`, no `TypeNameHandling`-style unsafe
  polymorphism.

## Assertions

- FluentAssertions for values and objects, with `because` reasons.
- Use `AssertionScope` to check several fields of one result in one go.
- `Should().BeEquivalentTo(expected, opts => opts.Excluding(x => x.Id))` for
  object comparison instead of field-by-field chains.
- Never `Assert.Pass()` to exit early, and never `Assert.Ignore()` without a
  linked issue.

## Configuration

- `Microsoft.Extensions.Configuration` chain: `AddJsonFile("appsettings.json")`
  → `AddJsonFile($"appsettings.{env}.json", optional: true)` →
  `AddEnvironmentVariables("AF_")`.
- Bind to `record`-based options classes with `ValidateDataAnnotations()` and
  `ValidateOnStart()`.
- Read config once into a singleton; tests take it via constructor or fixture,
  never `Environment.GetEnvironmentVariable` inline.

## Readability: keep LINQ out of tests

The team reading this code includes people whose main language is not C#. A
LINQ chain is fast to write and slow to read, and it is the most common reason
someone gives up on a test file. Default to a plain `foreach`.

```csharp
// Avoid: three concepts stacked into one expression
var names = rows.Where(r => r.IsActive)
                .OrderBy(r => r.CreatedAt)
                .Select(r => r.Name.Trim())
                .ToList();

// Prefer: obvious to anyone, and debuggable line by line
var names = new List<string>();
foreach (var row in rows)
{
    if (!row.IsActive) continue;
    names.Add(row.Name.Trim());
}
names.Sort();
```

Rules:

- No LINQ **chains** in `tests/`, `pages/`, or `flows/`. Use a loop.
- A single, one-line LINQ call doing one obvious thing is fine anywhere:
  `orders.Count(o => o.IsPaid)`, `items.First(i => i.Id == id)`.
- `Select` + `Where` + `OrderBy` + `GroupBy` in one statement: split it, or
  move it into a named helper method in `Support/` with a clear name and a
  comment stating the business rule.
- Never use query syntax (`from x in y select`). One style only, and the plain
  loop is that style.
- No `Aggregate`. If you need a running total, write the loop.
- No LINQ inside an assertion. Compute the value on its own line, name it, then
  assert on the named variable. The failure message then shows a real value.

Other C# constructs to avoid in test code:

| Avoid                                        | Prefer                                  |
| -------------------------------------------- | --------------------------------------- |
| Nested ternaries, `?:` inside interpolation  | `if`/`else` on separate lines            |
| Long expression-bodied members doing real work | A normal method body with `{ }`        |
| `dynamic`, reflection, `Activator.CreateInstance` | Typed code                        |
| Custom extension methods that read like a DSL | Ordinary named methods                  |
| Pattern matching with many nested clauses    | A `switch` statement, or `if`/`else`     |
| Tuples with unnamed items (`item.Item1`)     | A `record` with named properties         |
| `var` where the type is not obvious from the right-hand side | The explicit type      |
| Deeply chained null-conditionals (`a?.b?.c?.d`) | A guard clause that fails with a clear message |

Expression-bodied members are fine for one-line property accessors and simple
locator definitions. The line to hold is: **can a Java or Python developer read
it correctly on the first pass?**

## Anti-patterns specific to .NET

- `Thread.Sleep` / `Task.Delay` as a wait.
- `[Order]` attributes used to create test dependencies.
- Static mutable state in fixtures (breaks parallel runs).
- `[SetUp]` that logs in through the UI for every test — use storage state
  reuse or an API-issued token.
- Catching `Exception` to convert a failure into a log line.
- `dynamic` or `JObject` traversal instead of typed models.
