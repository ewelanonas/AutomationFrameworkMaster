# Java Automation Module

A working test automation framework for the JVM, running against the
[Toolshop](https://practicesoftwaretesting.com) demo application.

**33 tests, green, in about 28 seconds**, four threads in parallel, headless,
producing both JUnit XML and Allure output.

Branch: `framework/java`. Shared standards and contracts live on `main` — see
the [root README](../README.md#branching-model).

---

## Run it

```powershell
# from the repository root
Copy-Item .env.example .env     # fill in the demo credentials it documents

mvn -f java/pom.xml spotless:apply          # format
mvn -f java/pom.xml -B clean test           # everything, ~28s
```

Playwright downloads its browsers on first use. To do it explicitly, which is
what you want in CI so it can be cached:

```powershell
mvn -f java/pom.xml exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps chromium"
```

### Suite selection

Tags, never file paths — paths drift.

```powershell
mvn -f java/pom.xml test -Dgroups=smoke        # 9 tests, ~12s — the PR gate
mvn -f java/pom.xml test -Dgroups=regression   # full functional coverage
mvn -f java/pom.xml test -Dgroups=contract     # schema verification, no browser
mvn -f java/pom.xml test "-Dtest=AuthApiTest"  # one class
```

Quarantined tests are excluded from every run by default, via
`excludedGroups` in the POM.

### Useful switches

| Switch | Effect |
| --- | --- |
| `-Daf.env=dev` | Selects `shared/environments/dev.json` |
| `-DAF_HEADLESS=false` | Watch the browser. Run this yourself; it blocks. |
| `-Dsurefire.rerunFailingTestsCount=0` | Confirm a flake is real (already the default) |
| `AF_DATA_SEED=<n>` | Reproduce a run's generated data exactly |
| `AF_RUN_ID=<id>` | Reuse a run id, to target data a previous run created |

### Reports

| Output | Where |
| --- | --- |
| JUnit XML | `java/target/surefire-reports/*.xml` |
| Allure results | `java/target/allure-results/` |
| Failure artifacts | `java/target/failure-artifacts/<runId>/<test>/` |

```powershell
allure serve java/target/allure-results          # if the Allure CLI is installed
npx playwright show-trace java/target/failure-artifacts/<runId>/<test>/trace.zip
```

Traces, screenshots and page HTML are written **on failure only**. A green run
leaves `failure-artifacts/` absent entirely.

---

## Layout

```text
java/
├── pom.xml                                  every version managed here, none inline
├── src/main/java/com/company/automation/
│   ├── support/       Config, ConfigLoader, RepoPaths, RunContext, Redaction,
│   │                  PlaywrightFactory, ApiSpec, RedactingApiLogFilter,
│   │                  SchemaValidator, TestValues, ConsoleErrorPolicy
│   │   └── extensions/  BrowserExtension, MdcExtension
│   ├── models/        Product, ProductImage, Category, Brand, PagedProducts,
│   │                  LoginRequest, LoginResponse, ApiError
│   ├── clients/       ApiResult, AuthClient, ProductsClient
│   ├── pages/         HomePage, ProductDetailPage, LoginPage, AccountPage
│   └── flows/         AuthFlow
└── src/test/java/com/company/automation/
    ├── ApiTestBase, UiTestBase, TestPreconditions
    ├── api/           ProductCatalogueApiTest (11), AuthApiTest (7)
    ├── contract/      ToolshopContractTest (6)
    └── ui/            ProductBrowsingTest (5), SignInTest (4)
```

Dependencies point downward only: `tests → flows → pages/clients →
support/models`.

---

## The parts worth reading first

### `PlaywrightFactory` — why everything is `ThreadLocal`

Playwright objects are not thread safe, and JUnit runs these tests
concurrently. Each thread gets its own `Playwright` and `Browser`; each **test**
gets its own `BrowserContext` and `Page`.

`Playwright.create()` launches a Node process and costs seconds, so it is
created once per thread and reused. A `BrowserContext` is cheap and gives
complete isolation, which is why it is per-test. Sharing a page across tests is
the cause of the classic "fails only when it runs second" flake.

### `BrowserExtension` — why an extension, not `@BeforeEach`

`TestWatcher.testFailed` runs *after* `afterEach`, by which point the page is
already closed. This extension records the failure in
`handleTestExecutionException` and acts on it in `afterEach`, which is what
makes a screenshot of the actual failure possible at all.

Tracing is always started and only ever *saved* on failure. Starting it
conditionally would mean the first failure is the one run without a trace —
precisely the run you need.

### `AuthFlow` — the highest-value flow in the suite

Signs in over the API and injects the token into the browser, so only the tests
that are genuinely *about* logging in ever touch the form.

The injection target was read from the running application: it keeps its JWT in
`localStorage` under `auth-token`, as a raw token string with no wrapper.
`addInitScript` installs it before any page script runs, so the app is
authenticated on first paint with no logged-out flash to race against.

`SignInTest` is the only class that uses the login form, and one of its tests
covers the seeding mechanism itself so a regression there is reported directly
rather than as a cascade of unrelated failures.

### `RedactingApiLogFilter` — why not `AllureRestAssured`

The stock Allure filter attaches headers verbatim, which puts a live bearer
token into the report and into CI artifacts that outlive the run. Everything
here passes through `Redaction` first: sensitive headers and JSON fields by
name, JWT and card-shaped strings by pattern.

`LoginRequest` and `LoginResponse` also override `toString()`, because a
record's generated one prints every component — including the password and the
token — and would defeat the redaction layer from inside a log line.

### `ApiResult` — clients never throw on a non-2xx

A 403 test and a 200 test read identically, and neither needs a `try`/`catch`.
The body is deserialized only on success, so an error response never fails for
the wrong reason and buries the real status code.

---

## Three things this suite caught while being built

Worth keeping, because they are the reasons the rules exist.

### 1. The contract test found two gaps in its own schema

The product schema was derived from `GET /products` responses. The detail
endpoint returns two extra things — a `specs` array and `category.parent_id` —
so `ToolshopContractTest` failed on `additionalProperties: false` and named the
exact property:

```text
/category: property 'parent_id' is not defined in the schema
           and the schema does not allow additional properties
```

The schema was wrong, not the test. That is the entire return on strict
contracts and on validating the detail endpoint separately from the list
instead of assuming one stands in for the other.

### 2. A real race in the page object

`HomePage.visibleProductNames()` originally read `count()` and then indexed
with `nth(i)`. After a search, the grid re-renders from 9 cards to 6 — so the
count was taken against the old grid and `nth(6)` waited for an element that no
longer existed:

```text
Timeout 10000ms exceeded.
  - waiting for locator("internal:attr=[data-test=\"product-name\"]").nth(6)
```

Two fixes, both from the house rules. `allInnerTexts()` resolves the whole set
in **one** call, removing the count-then-index window. And the test now waits
on the observable end state before enumerating:

```java
assertThat(home.productNames.first()).isVisible();     // passes instantly — the OLD grid
assertThat(home.productNames.first()).containsText(term); // retries until the search rendered
```

The first assertion alone is a trap: it is satisfied by the pre-search grid.
The fix was applied to `ProductDetailPage.specificationNames()` too, because
the pattern was the bug, not the one call site.

### 3. "Assert zero console errors" does not survive contact with a real app

The catalogue page fires an authenticated request while signed out and logs the
resulting 401 on every anonymous load. That is the application's own behaviour.

A blanket empty assertion would be red on every run and deleted within a week,
taking the useful part of the check with it. `ConsoleErrorPolicy` holds a
reviewed allowlist instead, **each entry carrying its reason**. The
`unauthorized` entry matches the exact observed string rather than the word
alone, so a genuine authorization defect logged in different words still fails.

---

## Test design notes

**No hardcoded product ids.** The demo data is reseeded periodically — ids
captured one hour returned 404 the next. Every test fetches an id from the
catalogue first. This is why the reseed surfaced as a schema gap rather than a
wall of 404s.

**Invariants, not magic numbers.** The catalogue holds 50 products today. No
test asserts that. They assert what is actually promised: page size is
respected, `from`/`to` agree with the page contents, `last_page` follows from
`total`, and no product appears on two pages. Those hold whatever the data does.

**Observed behaviour, not preferred behaviour.** A login request with the
`password` field missing returns **401**, not the 422 a validation failure would
normally produce. The test asserts 401 and the inconsistency is recorded in
[`shared/contracts/README.md`](../shared/contracts/README.md) to raise with the
API owners. A test written against the status we would prefer fails while the
product behaves as built.

**Missing credentials skip, they do not fail.** `TestPreconditions` aborts with
a message naming the exact variable, so a fresh clone stays green while still
saying what to set. CI supplies these, so a skip *there* is a pipeline bug.

---

## Known gaps

Honest list of what a production suite would add:

- **No `.github/workflows/`.** Nothing runs this in CI yet.
- **No cleanup path exercised.** The demo API is read-only for a customer
  account, so nothing is created and nothing needs deleting. `ProductsClient`
  has `create` and `deleteIgnoringMissing` for the authorization-boundary test,
  but no test currently seeds a record.
- **No cross-tenant test.** The demo has roles but not tenants, so the
  highest-value authorization case has nowhere to run here.
- **No Testcontainers usage.** Nothing to stand up against a hosted demo.
- **Chromium only.** Firefox and WebKit belong in a scheduled job.
- **No accessibility scan.** `axe-core` would slot into `ProductBrowsingTest`.
- **No visual tests.** Deliberate — they need a controlled environment.
