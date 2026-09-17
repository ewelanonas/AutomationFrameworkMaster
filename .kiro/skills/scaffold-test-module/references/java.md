# Java Module Setup

## Layout

```text
java/
├── pom.xml
├── src/main/java/com/company/automation/{support,models,pages,clients,flows}/
├── src/main/resources/{logback.xml,allure.properties}
└── src/test/java/com/company/automation/{ui,api,contract}/
    src/test/resources/junit-platform.properties
```

## pom.xml essentials

- `maven.compiler.release` = 21, UTF-8 encoding.
- BOMs in `<dependencyManagement>`: `junit-bom`, `allure-bom`. Pin Playwright,
  REST Assured, AssertJ, Jackson, Datafaker, Testcontainers versions there too.
  No version literals in `<dependencies>`.
- Surefire with the Allure AspectJ weaver:

```xml
<plugin>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <argLine>-javaagent:"${settings.localRepository}/org/aspectj/aspectjweaver/${aspectj.version}/aspectjweaver-${aspectj.version}.jar"</argLine>
    <systemPropertyVariables>
      <allure.results.directory>${project.build.directory}/allure-results</allure.results.directory>
      <junit.jupiter.execution.parallel.enabled>true</junit.jupiter.execution.parallel.enabled>
    </systemPropertyVariables>
  </configuration>
</plugin>
```

- Spotless with google-java-format bound to `validate`, Error Prone on the
  compiler plugin.
- Surefire already writes JUnit XML to `target/surefire-reports` — that is the
  CI artifact, no converter needed.

## junit-platform.properties

```properties
junit.jupiter.execution.parallel.enabled = true
junit.jupiter.execution.parallel.mode.default = concurrent
junit.jupiter.execution.parallel.mode.classes.default = concurrent
junit.jupiter.execution.parallel.config.strategy = dynamic
junit.jupiter.execution.parallel.config.dynamic.factor = 1.0
junit.jupiter.testinstance.lifecycle.default = per_method
junit.jupiter.displayname.generator.default = org.junit.jupiter.api.DisplayNameGenerator$ReplaceUnderscores
```

## Playwright lifecycle (thread-safe)

With parallel execution enabled, every Playwright object must be `ThreadLocal`.

```java
public final class PlaywrightFactory {
  private static final ThreadLocal<Playwright> PW = ThreadLocal.withInitial(Playwright::create);
  private static final ThreadLocal<Browser> BROWSER = ThreadLocal.withInitial(
      () -> PW.get().chromium().launch(new BrowserType.LaunchOptions().setHeadless(true)));

  public static BrowserContext newContext() {
    return BROWSER.get().newContext(new Browser.NewContextOptions()
        .setStorageStatePath(Paths.get("target/storage-state.json")));
  }

  public static void closeAll() {
    Browser browser = BROWSER.get();
    if (browser != null) {
      browser.close();
    }
    Playwright playwright = PW.get();
    if (playwright != null) {
      playwright.close();
    }
    BROWSER.remove();
    PW.remove();
  }
}
```

Call `Playwright.selectors().setTestIdAttribute("data-testid")` once after
creation. Close per-thread resources in an `AfterAllCallback` extension, and
remove the `ThreadLocal` to avoid leaks.

## Extensions instead of base classes

Write these as JUnit 5 extensions in `support/`:

- `BrowserExtension` — `BeforeEachCallback`/`AfterEachCallback` creating the
  context and page, plus a `ParameterResolver` so tests receive `Page`.
- `FailureArtifactExtension` — `TestWatcher.testFailed` capturing screenshot,
  `page.content()`, trace, and attaching via `Allure.addAttachment`.
- `MdcExtension` — puts test name and correlation id into MDC, clears after.

Register with `@ExtendWith` on a single thin base class per test type.

## Config

Small `Config` record built in a static initializer from
`shared/environments/<env>.json` (Jackson) overlaid with `AF_*` environment
variables. `-Denv=dev` selects, default `local`. Throw on missing keys with the
full list.

## Logging

`logback.xml` with an encoder pattern including `%X{correlationId}` and
`%X{testName}` so parallel logs are separable. Console appender only; CI
captures stdout.

## Verify

```powershell
mvn -f java/pom.xml spotless:apply
mvn -f java/pom.xml verify -DskipTests
mvn -f java/pom.xml exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
mvn -f java/pom.xml test -Dgroups=smoke -Denv=local
```

Confirm `java/target/surefire-reports/*.xml` and
`java/target/allure-results/` are populated.
