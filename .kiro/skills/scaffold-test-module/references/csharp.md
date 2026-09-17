# C# / .NET Module Setup

## Create the solution

```powershell
New-Item -ItemType Directory -Path csharp -Force
dotnet new sln -o csharp -n AutomationFramework
dotnet new classlib -o csharp/src/AutomationFramework.Core -n AutomationFramework.Core
dotnet new nunit    -o csharp/tests/AutomationFramework.UiTests  -n AutomationFramework.UiTests
dotnet new nunit    -o csharp/tests/AutomationFramework.ApiTests -n AutomationFramework.ApiTests
dotnet sln csharp/AutomationFramework.sln add csharp/src/AutomationFramework.Core
dotnet sln csharp/AutomationFramework.sln add csharp/tests/AutomationFramework.UiTests
dotnet sln csharp/AutomationFramework.sln add csharp/tests/AutomationFramework.ApiTests
dotnet add csharp/tests/AutomationFramework.UiTests reference csharp/src/AutomationFramework.Core
dotnet add csharp/tests/AutomationFramework.ApiTests reference csharp/src/AutomationFramework.Core
```

## Directory.Build.props

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
</Project>
```

## Directory.Packages.props

Pin every version here, nowhere else. Packages needed:

`NUnit`, `NUnit3TestAdapter`, `Microsoft.NET.Test.Sdk`,
`Microsoft.Playwright.NUnit`, `FluentAssertions`, `Refit.HttpClientFactory`,
`Microsoft.Extensions.Configuration.Json`,
`Microsoft.Extensions.Configuration.EnvironmentVariables`,
`Microsoft.Extensions.Options.DataAnnotations`, `Microsoft.Extensions.Http`,
`Bogus`, `Allure.NUnit`, `Serilog.Extensions.Logging`, `Testcontainers`,
`JunitXml.TestLogger`.

## Parallel execution

`csharp/tests/.../AssemblyInfo.cs`:

```csharp
[assembly: Parallelizable(ParallelScope.Fixtures)]
[assembly: LevelOfParallelism(4)]
```

Per-fixture state must be instance-level. Any `static` mutable field breaks
parallel runs.

## Playwright lifecycle

Own it in `Support/BrowserFactory` rather than inheriting `PageTest`, so you
control context options and tracing:

```csharp
public sealed class BrowserFactory : IAsyncDisposable
{
    private IPlaywright? _playwright;
    private IBrowser? _browser;

    public async Task<IBrowser> GetBrowserAsync()
    {
        _playwright ??= await Playwright.CreateAsync();
        _playwright.Selectors.SetTestIdAttribute("data-testid");
        _browser ??= await _playwright.Chromium.LaunchAsync(new() { Headless = true });
        return _browser;
    }

    public async ValueTask DisposeAsync()
    {
        if (_browser is not null) await _browser.CloseAsync();
        _playwright?.Dispose();
    }
}
```

One `IBrowser` per assembly (a `OneTimeSetUp` on a `[SetUpFixture]`), one
`IBrowserContext` per test in `[SetUp]`, closed in `[TearDown]`.

## Failure artifacts

In `[TearDown]`, read `TestContext.CurrentContext.Result.Outcome.Status`. On
failure: stop tracing to a file, capture a screenshot and page content, and
attach all of it via `AllureApi.AddAttachment`. On success, stop tracing with
no path so nothing is written.

## Config

```csharp
var config = new ConfigurationBuilder()
    .AddJsonFile("../../shared/environments/local.json", optional: false)
    .AddJsonFile($"../../shared/environments/{env}.json", optional: true)
    .AddEnvironmentVariables("AF_")
    .Build();

services.AddOptions<ApiOptions>().Bind(config.GetSection("api"))
        .ValidateDataAnnotations().ValidateOnStart();
```

## Reporting

- `allureConfig.json` next to the test assembly, `directory` pointing at
  `reports/allure-results`.
- JUnit XML for CI:
  `dotnet test --logger "junit;LogFilePath=reports/junit.xml"`.
- Add `[AllureNUnit]` to fixtures, `AllureApi.Step` inside flows.

## Verify

```powershell
dotnet restore csharp/AutomationFramework.sln
dotnet format csharp/AutomationFramework.sln --verify-no-changes
dotnet build csharp/AutomationFramework.sln --no-restore
pwsh csharp/tests/AutomationFramework.UiTests/bin/Debug/net8.0/playwright.ps1 install --with-deps
dotnet test csharp/AutomationFramework.sln --no-build --filter "Category=Smoke" --logger "junit;LogFilePath=reports/junit.xml"
```
