---
inclusion: fileMatch
fileMatchPattern: ["java/**", "**/*.java", "**/pom.xml", "**/build.gradle", "**/build.gradle.kts", "**/junit-platform.properties"]
---

# Java Automation Conventions

Stack: JDK 17, Maven, JUnit 5 (Jupiter), Playwright for Java, REST Assured,
AssertJ, Jackson, Datafaker, Allure, Testcontainers, SLF4J + Logback.

JDK 17 rather than 21 — see `docs/decisions/0001-target-jdk-17.md`.

## Project layout

```text
java/
├── pom.xml
├── src/main/java/com/company/automation/
│   ├── support/    Config, PlaywrightFactory, Waits, Redaction, RunContext
│   ├── models/     records + Jackson annotations
│   ├── pages/      page + component objects
│   ├── clients/    REST Assured request specs + typed clients
│   └── flows/      business actions
├── src/main/resources/  logback.xml, allure.properties
└── src/test/java/com/company/automation/
    ├── ui/  api/  contract/
    └── src/test/resources/junit-platform.properties
```

## Build configuration

- Java 17, `maven.compiler.release=17`.
- Manage every version in `<dependencyManagement>` with BOMs
  (junit-bom, playwright, allure-bom). No version literals in `<dependencies>`.
- Surefire configured for parallel execution and Allure's AspectJ weaver.
- Spotless (google-java-format) + Error Prone bound to `verify`.
- Fail the build on warnings: `-Werror` where practical.

`junit-platform.properties`:

```properties
junit.jupiter.execution.parallel.enabled = true
junit.jupiter.execution.parallel.mode.default = concurrent
junit.jupiter.execution.parallel.mode.classes.default = concurrent
junit.jupiter.execution.parallel.config.strategy = dynamic
junit.jupiter.execution.parallel.config.dynamic.factor = 1.0
junit.jupiter.testinstance.lifecycle.default = per_method
```

## Test structure

- Class per feature, suffix `Test`. `@DisplayName` on class and method with a
  human-readable sentence.
- Tag suites with `@Tag("smoke")`, `@Tag("regression")`, `@Tag("contract")`.
  Select via `-Dgroups=smoke`.
- Method naming: `should<Expected>When<Condition>`.
- Parameterized: `@ParameterizedTest` with `@CsvSource` for literals,
  `@MethodSource` for objects, `@ArgumentsSource` for complex generation. Set
  `name = "{index}: {0}"` so cases are identifiable.
- Use `@Nested` to group by precondition, not to create ordering.
- Never `@TestMethodOrder` / `@Order` to build test dependencies.
- `@Disabled` requires a reason string with a ticket id.

```java
@Tag("regression")
@DisplayName("Checkout payment validation")
class CheckoutTest extends UiTestBase {

  @Test
  @DisplayName("ORD-142: rejects payment when the card has expired")
  void shouldRejectPaymentWhenCardIsExpired() {
    var customer = CustomerBuilder.valid().withExpiredCard().build();

    checkoutFlow.start(customer);

    assertThat(checkoutPage.paymentErrorText())
        .as("expired cards must be rejected at payment")
        .isEqualTo("Your card has expired.");
  }
}
```

## Extensions over inheritance

Prefer JUnit 5 `Extension`s (`BeforeEachCallback`, `TestWatcher`,
`ParameterResolver`) over deep base-class hierarchies. One thin base class per
test type is acceptable; three levels is not.

Use a `TestWatcher` extension for failure artifacts: screenshot, trace, page
HTML, and the correlation id, attached to Allure on `testFailed`.

## Playwright for Java

- `Playwright` and `Browser` are expensive: create one per JVM (or per thread
  group) in a `ThreadLocal`-backed factory in `support/`.
- One `BrowserContext` and `Page` **per test**, closed in teardown.
- With parallel JUnit execution, all Playwright objects must be `ThreadLocal`.
  Never share a `Page` across threads.
- Set `Playwright.selectors().setTestIdAttribute("data-testid")` once.
- Locators: `page.getByTestId`, `getByRole`, `getByLabel`.
- UI state assertions use `assertThat(locator).isVisible()` from
  `com.microsoft.playwright.assertions.PlaywrightAssertions` — it auto-retries.
  AssertJ is for plain values and models.
- Tracing on, saved only on failure.
- Never `page.waitForTimeout`.

## API clients with REST Assured

- Build a shared `RequestSpecification` in `support/` with base URI, content
  type, correlation-id header, and a redacting log filter. Reuse it.
- Use `.then().extract().as(Model.class)` into records; never chain
  `body("a.b.c", equalTo(...))` for business assertions — extract and assert
  with AssertJ so failures print the whole object.
- Do not assert status inside the client; return the response and let the test
  assert. Negative tests need non-2xx to be a normal outcome.
- Configure Jackson centrally: fail on unknown properties in contract tests,
  ignore them in workflow tests.

## Assertions

- AssertJ only. No `org.junit.Assert`, no Hamcrest.
- Always add `.as("business rule")` to non-obvious assertions.
- `assertThat(actual).usingRecursiveComparison().ignoringFields("id")` for
  object equality.
- `assertSoftly` for multi-field verification of one action.
- `assertThatThrownBy` for expected exceptions, asserting on type and message.

## Configuration

- Typed config interface loaded by Owner or a small `Config` record built from
  `shared/environments/<env>.json` + `AF_*` environment variables.
- `-Denv=dev` selects the environment; default is `local`.
- Validate on class init and throw with the list of missing keys.

## Logging

- SLF4J with Logback. Use MDC to attach the test name and correlation id so
  parallel logs stay separable. Clear MDC in teardown.
- No `System.out.println`.
- Never log a full header map; route through the redaction helper.

## Readability: keep Stream chains out of tests

Same rule as the other modules: the reader may not be a Java specialist. A
plain `for` loop is always understood; a four-stage stream with a collector is
not.

```java
// Avoid
var names = rows.stream()
    .filter(Row::isActive)
    .sorted(comparing(Row::createdAt))
    .map(r -> r.name().trim())
    .collect(Collectors.toList());

// Prefer
List<String> names = new ArrayList<>();
for (Row row : rows) {
  if (!row.isActive()) continue;
  names.add(row.name().trim());
}
Collections.sort(names);
```

Rules:

- No stream **chains** in `src/test/` or in `pages/` and `flows/`. Use a loop.
- One short terminal operation is fine: `orders.stream().anyMatch(Order::isPaid)`.
- No `Collectors.groupingBy`, `flatMap`, `reduce`, or nested lambdas in test
  code. If the transformation is genuinely needed, put it in a named method in
  `support/` with a comment stating the business rule.
- No `Optional` chains as control flow. A plain null check reads better and
  fails more clearly:

```java
// Avoid
Optional.ofNullable(browser.get()).ifPresent(Browser::close);

// Prefer
Browser browser = BROWSER.get();
if (browser != null) {
  browser.close();
}
```

- `Optional` as a return type is fine. `Optional.map(...).flatMap(...).orElseGet(...)`
  as a chain is not.
- No method-reference gymnastics where a lambda body is clearer, and no lambda
  longer than one statement — extract a named method.

Other Java constructs to avoid in test code:

| Avoid                                     | Prefer                             |
| ----------------------------------------- | ---------------------------------- |
| Nested ternaries                          | `if`/`else`                        |
| Anonymous inner classes with logic        | A named class or a named method    |
| Reflection, `Class.forName`, proxies      | Typed code                         |
| Generic wildcards beyond `List<String>` complexity | A concrete type or a record |
| Builder chains longer than the screen     | Break across lines, or a helper    |
| `var` where the type is not obvious       | The explicit type                  |

## Anti-patterns specific to Java

- `Thread.sleep` anywhere.
- Static non-`ThreadLocal` `Page`/`WebDriver` fields with parallel enabled.
- `@BeforeAll` doing UI login for the whole class.
- Catching `Exception` and logging instead of failing.
- Raw `Map<String, Object>` payloads instead of records.
- `try (var pw = Playwright.create())` inside every test (huge startup cost).
