# Python Automation Module

A working test automation framework for CPython, running against the
[Toolshop](https://practicesoftwaretesting.com) demo application.

**34 product tests plus 14 framework-internal tests, green**, headless, in
parallel, producing both JUnit XML and Allure output. The destructive
account-lockout test is one of the 34 and is excluded from every routine run.

Shared standards and contracts live at the repository root — see the
[root README](../README.md).

---

## Run it

Every command runs from the repository root. `--directory python` is what makes
the working directory `python/`, which the suite requires (see
[Invocation directory](#invocation-directory)).

```powershell
uv python install 3.12                                    # once; honours python/.python-version
uv sync --directory python                                # install, locked
uv run --directory python playwright install --with-deps chromium
uv run --directory python pytest -n auto                  # everything, no credentials needed
```

No credentials to configure. Every test that authenticates registers its own
account over the API — see
[a shared test account is shared mutable state](#a-shared-test-account-is-shared-mutable-state).

### Suite selection

Markers, never file paths — paths drift. Note that a `-m` on the command line
**replaces** the one in `addopts` rather than combining with it, which is why
every string below spells out the exclusions. Getting this wrong is how the
account-locking test ends up in the gate.

```powershell
uv run --directory python pytest -m "smoke and not destructive and not quarantine"
uv run --directory python pytest -m "regression and not destructive and not quarantine"
uv run --directory python pytest -m "contract and not destructive and not quarantine"
uv run --directory python pytest -m "not destructive and not quarantine"   # the default
uv run --directory python pytest -m "destructive and not quarantine"       # by hand only
```

| Suite | Selection | Count |
| --- | --- | --- |
| smoke | `-m "smoke and not destructive and not quarantine"` | 23 (9 product + 14 framework) |
| regression | `-m "regression and not destructive and not quarantine"` | 27 product |
| contract | `-m "contract and not destructive and not quarantine"` | 6 |
| all (default) | `-m "not destructive and not quarantine"` | 47 |
| destructive | `-m "destructive and not quarantine"` | 1 |

**The `destructive` suite burns an account on purpose.** It drives
`test_locks_account_when_failed_attempts_are_repeated` until the demo API
answers `423 Locked`, against an account it registered itself. Nothing else
ever uses that account, so locking it costs nothing. Run it by hand after
changing anything in the auth path. No CI run executes it, which matches Java
(`java/pom.xml` sets `<excludedGroups>quarantine,destructive</excludedGroups>`);
C# differs and runs it nightly under `regression`, and that asymmetry is C#'s
rather than something for this module to copy.

**Quarantine.** A quarantined test is excluded from every run, including
`destructive`. The marker description states the price of using it: a
quarantined test needs **an owner, a ticket and a date**. Without all three it
is not quarantined, it is abandoned.

### Lint, format and types

```powershell
uv run --directory python ruff check .
uv run --directory python ruff format --check .
uv run --directory python mypy src tests conftest.py
```

`mypy` takes `conftest.py` explicitly: it is a top-level module rather than part
of the `framework` package, and `tests/` has no `__init__.py` anywhere —
`--import-mode=importlib` is what makes that work, and
`explicit_package_bases` with `mypy_path = "src"` is what makes mypy agree.

### Useful switches

Every variable is read by the config layer in `support/config.py`. No test and
no page object reads an environment variable directly.

| Variable | Effect |
| --- | --- |
| `AF_ENV=dev` | Selects `shared/environments/dev.json` |
| `AF_UI_BASEURL`, `AF_API_BASEURL` | Point at a different target. No built-in default exists; a missing value is fatal at startup |
| `AF_HEADLESS=false` | Watch the browser. Run this yourself; it blocks |
| `AF_BROWSER=firefox` | `chromium` \| `firefox` \| `webkit` |
| `AF_DATA_SEED=<n>` | Reproduce a run's generated data exactly. The seed used is logged at startup and written to the Allure environment block as `dataSeed` |
| `AF_RUN_ID=<id>` | Reuse a run id, to target data a previous run created |
| `AF_TIMEOUTS_ELEMENTMS=<ms>` | Override the element and assertion timeout. CI uses 30000 |
| `AF_TIMEOUTS_NAVIGATIONMS`, `AF_TIMEOUTS_APIMS`, `AF_TIMEOUTS_WORKFLOWMS` | The other three budgets |

A malformed or out-of-range `AF_TIMEOUTS_*` value **stops the run** rather than
being ignored. Someone who sets it is deliberately changing the waiting policy,
usually to fix a failing pipeline; silently ignoring a typo would mean the run
behaves exactly as before and the engineer concludes the timeout was not the
problem. Accepted range is 1000–600000 ms, and the lower bound also catches
writing seconds where milliseconds are expected.

`AF_WORKERS` is listed in `.env.example` but is **not** read here: worker count
comes from `-n` on the command line, as it does in the other two modules.

### Built-in defaults

Verified against `ConfigLoader.cs` and `ConfigLoader.java`; all three modules
agree row for row.

| Key | Default |
| --- | --- |
| `timeouts.elementMs` | 10000 |
| `timeouts.navigationMs` | 30000 |
| `timeouts.apiMs` | 30000 |
| `timeouts.workflowMs` | 60000 |
| `ui.locale` | `en-US` |
| `ui.timezoneId` | `UTC` |
| `ui.viewport.width` / `.height` | 1440 / 900 |
| `api.loginPath` | `/users/login` |
| `execution.headless` | `true` |
| `execution.browser` | `chromium` |
| `execution.testIdAttribute` | `data-testid` |

**Defaults cover everything except `ui.baseUrl` and `api.baseUrl`, which have
no default at all and are fatal when missing.** That is a stronger guarantee
than defaulting to something non-production. `execution.testIdAttribute`
defaults to `data-testid` and `shared/environments/local.json` overrides it to
`data-test`, which this target actually uses; the module never hardcodes either.

Resolution order, lowest precedence first: built-in defaults →
`shared/environments/<env>.json` → repo-root `.env` → process environment
variables. `AF_RUN_ID` and `AF_DATA_SEED` are read from the **process**
environment only, because run identity resolves before any config loading.

### Invocation directory

The suite refuses to start unless the working directory is `python/`, with a
`pytest.UsageError` naming the canonical command.

That is deliberate and there is **no override**. `allure-pytest` resolves
`--alluredir` against the invocation directory while `repo_paths.reports()` is
anchored to the repository root. Launch from the repository root and the two
diverge: Allure reads the directory with no `environment.properties` and the
report is quietly wrong, which is worse than a failure. One supported way to
launch is worth more than three that each put artifacts somewhere different.

**IDE and editor test runners must set their working directory to `python/`.**
That is the escape hatch — configure the runner, not the guard.

### Reports

| Output | Where |
| --- | --- |
| JUnit XML | `python/reports/junit.xml` (with `--junitxml=reports/junit.xml`) |
| Allure results | `python/reports/allure-results/` |
| Failure artifacts | `python/reports/failure-artifacts/<runId>/<test>/` |

```powershell
allure serve python/reports/allure-results      # if the Allure CLI is installed
npx playwright show-trace python/reports/failure-artifacts/<runId>/<test>/trace.zip
```

Traces, screenshots, DOM snapshots and diagnostics are written **on failure
only**. A green run leaves `failure-artifacts/` absent entirely. Tracing is
always *started*, though — starting it conditionally would mean the first
failure is the one run with no trace.

`environment.properties` carries `envName`, `uiBaseUrl`, `apiBaseUrl`,
`browser`, `headless`, `elementMs`, `runId`, `processTag`, `dataSeed` and
`pythonVersion`. It is written exactly once per run even under `-n`, behind a
file lock plus a marker file in a run-scoped temp directory, and it is the
primary evidence that the resolved timeout and the data seed are what the run
actually used — a log line can be swallowed by pytest's capture, a file on disk
cannot.

`log_cli` is **off** by default. Turn it on for local debugging only:
`-o log_cli=true -o log_cli_level=INFO`.

---

## Layout

```text
python/
├── pyproject.toml          build backend, project, pytest, ruff and mypy config
├── uv.lock                 committed; every package pinned to one exact version
├── .python-version         3.12
├── conftest.py             cross-suite hooks and fixtures ONLY
├── src/framework/
│   ├── support/            repo_paths, run_context, redaction, test_log, config,
│   │                       api_http, browser, waits, navigation,
│   │                       console_error_policy, test_values, schema_validation,
│   │                       reporting
│   ├── models/             product, paged_products, auth, registration,
│   │                       api_error, test_account
│   ├── clients/            api_result (+ NoBody), products_client, auth_client,
│   │                       users_client
│   ├── pages/              home_page, login_page, account_page,
│   │                       product_detail_page
│   └── flows/              account_flow, auth_flow
└── tests/                  no __init__.py at any level
    ├── api/                test_product_catalogue (11), test_auth (8)
    ├── contract/           test_toolshop_contract (6)
    ├── ui/                 test_product_browsing (5), test_sign_in (4)
    └── support/            framework-internal checks (14), no network, no browser
```

Dependencies point downward only: `tests → flows → pages/clients →
support/models`. Nothing under `src/framework/` imports anything under
`tests/`. `pages/`, `clients/` and `flows/` contain **no assertions**.

`tests/support/` is a documented divergence from the `{ui,api,contract}` shape
in `.kiro/steering/structure.md`: a unit-level check of a framework internal
belongs to no product suite. Both shipped modules now carry the same folder
(`csharp/tests/AutomationFramework.Tests/Support/` and
`java/src/test/java/com/company/automation/support/`), so omitting it here
would be the divergence.

### Test inventory

| Suite | Cases | C# | Java |
| --- | --- | --- | --- |
| api | 19 | 19 | 19 |
| contract | 6 | 6 | 6 |
| ui | 9 | 9 | 9 |
| **product total** | **34** | **34** | **34** |
| framework-internal | 14 | 6 | 6 |

Python's framework-internal set is wider because it also covers redaction, the
console allowlist and the timeout-override helper — three things the other
modules verify only by review. `load_config` is `functools.cache` on a plain
function, so a test can reset it and re-resolve under a patched environment,
which closes a gap the C# module's cached static loader leaves open.

---

## The parts worth reading first

### `support/config.py` — one timeout policy, and fail-fast

Resolution is identical to the two shipped loaders, including the failure text,
which is why it is hand-written rather than built on `pydantic-settings`. A
missing `ui.baseUrl` or `api.baseUrl` raises at startup listing **every**
missing key and naming all three places checked.

The six models carry `extra="forbid"`, and the reason is **construction in
code**: a mistyped keyword argument inside the loader fails immediately instead
of yielding a config with a silently missing field. It does *not* validate the
descriptor file — that is read key by key, exactly as `ConfigLoader.cs` reads
it, and unknown keys are ignored because `local.json` legitimately carries
`name`, `description` and a nested `ui.viewport` against a flat `UiConfig`.

### `support/waits.py` — three waiting mechanisms, one policy

Playwright has three: the context action default, the navigation default, and
the one web-first assertions use. `expect()` keeps its **own** timeout and does
not inherit `set_default_timeout`, so without `waits.apply_assertion_timeout`
every UI assertion silently stays on the built-in 5 s whatever config says. One
timeout policy is only one policy if every mechanism reads from it.

There is no polling helper and no sleep in this module. `time.sleep` and
`page.wait_for_timeout` appear **zero** times, which is greppable and is a
verification step.

### `support/navigation.py` — the one `goto` call site

Waits for `domcontentloaded`, not `load`. Against this single-page application
`load` waits for every subresource, and the client-side router frequently
supersedes the initial navigation before those finish — surfacing as
`net::ERR_ABORTED` on a page that rendered perfectly well. That was a race in
the waiting strategy, not an application defect, and retrying the navigation
would have hidden it. Every page object navigates through this function;
`rg "\.goto\(" python/` matches nothing else.

### `support/run_context.py` — why there is a process tag

The run id is deliberately shared across the processes of one pipeline run, so
a generated record can be traced back to it. That sharing is also what broke
the suite once: two module jobs of one workflow run resolved the same run id
from `GITHUB_RUN_ID`, each restarted its own counter at 1, and the second job
re-registered the first job's addresses — the API answered `409` and both
suites went red with no code change. The process tag, `{job}-{attempt}-{random}`,
is what keeps the identity unique per process while the run id stays traceable.
See [ADR 0006](../docs/decisions/0006-process-tag-in-generated-identity.md).

Python has one problem the other two modules do not: under `pytest-xdist` each
worker is a separate process importing `run_context` afresh, so each would mint
its own run id. The root `conftest.py` pins it with
`os.environ.setdefault("AF_RUN_ID", run_context.run_id())` in
`pytest_configure`, which the controller runs before xdist spawns anything. The
process tag is deliberately **not** pinned — that is exactly what keeps
generated emails unique per worker.

### `support/redaction.py` — the choke point

Every log line, every Allure attachment and every HTTP report passes through it
first: sensitive headers and JSON fields by name, JWT, bearer and card-shaped
strings by pattern. It replaces with a fixed marker, never partially reveals,
and never reports a secret's length. No HAR is recorded or uploaded, because
HARs capture headers.

`LoginRequest`, `LoginResponse`, `RegisterRequest` and `TestAccount` override
**both** `__str__` and `__repr__`. Pydantic's generated `repr` prints every
field, and pytest's assertion rewriting prints `repr` — so overriding only
`__str__`, as C# does with its single `ToString()`, would leak the secret into
an assertion message.

`email` and `phone` are deliberately **not** in the field list, which narrows a
bullet in `.kiro/steering/test-data-and-secrets.md`. Redacting the generated
`af-{runId}-{processTag}-{n}@example.invalid` address would destroy the single
most useful diagnostic in the suite — the one that makes an identity collision
readable from a log — and no real PII exists in this module at all. Neither
shipped module redacts them either. This is a documented rule knowingly
narrowed across three modules, so it warrants an ADR; see
[Follow-ups owned outside this module](#follow-ups-owned-outside-this-module).

### `flows/auth_flow.py` — the highest-value flow in the suite

Signs in over the API and injects the token into the browser, so only the tests
genuinely *about* logging in ever touch the form. The injection target was read
from the running application: it keeps its JWT in `localStorage` under
`auth-token`, as a raw string with no wrapper. `add_init_script` installs it
before any page script runs, so the app is authenticated on first paint with no
logged-out flash to race against.

The token is quoted with `json.dumps` rather than a hand-rolled escaper. A token
is opaque and could in principle contain a quote or a backslash; concatenating
it into script text unescaped is the same class of mistake as string-building
SQL.

`test_sign_in.py` is the only file that uses the login form, and one of its
tests covers the seeding mechanism itself, so a regression there is reported
directly rather than as a cascade of unrelated failures.

### `clients/api_result.py` — clients never throw on a non-2xx

A 401 test and a 200 test read identically, and neither needs a `try`/`except`.
The body is parsed only on success, so an error response never fails for the
wrong reason and buries the real status code. `error()` **never raises** — it
returns an empty `ApiError` on a blank or non-JSON body, which is one behaviour
softer than C#, where `JsonSerializer.Deserialize` throws when a gateway answers
with HTML and fails a negative test for the wrong reason.

`NoBody` exists because the type parameter is bound to `BaseModel`, so
`ApiResult[None]` does not type-check anywhere. C# reached the same answer with
`public sealed record NoBody;` and Java with `ApiResult<Void>`.

### `tests/ui/conftest.py` — why the teardown is split in two

`page` depends on `browser_context`, so `page` tears down **first**. Live-page
artifacts — screenshot, DOM, diagnostics — are captured there, while the page
still exists. Tracing starts in `browser.new_context`, so it is stopped in the
`browser_context` teardown: whoever starts tracing stops it, including for a
test that takes a context and never opens a page.

`_test_failed` reads **both** `rep_setup` and `rep_call`. Setup is the one easy
to forget: a fixture ordered after `page` that fails — `disposable_account`
hitting a 409 or a 423, `sign_in_via_api` raising on a rejected login — leaves
a live page worth photographing, and that is the case where a screenshot
explains most. Reading only `rep_call` reports those as errors with no artifacts
at all.

The test log scope is cleared from `pytest_runtest_logfinish`, not from a
teardown hook, because it must outlive fixture teardown: the
`Trace written to ...` line and the artifact-capture warnings are written there
and are exactly the lines a reader needs the `[test]` field on.

---

## Things this suite proves on purpose

### A shared test account is shared mutable state

The negative sign-in tests send a wrong password on purpose. That increments a
server-side failed-attempt counter, and against a shared demo account the API
eventually started answering **`423 Locked`** to *every* login, including the
happy paths, across two language modules at once:

```json
{"error":"Account locked, too many failed attempts. Please contact the administrator."}
```

Not an application bug — a test-design defect, and one the house rules name
directly. The account was never written to by any test; the server keeps state
against the identity regardless.

`AccountFlow.create_customer()` registers a throwaway account over the API for
every test that authenticates. A per-test account can be locked, abused or left
in any state, because nothing else will ever use it. As a side effect the suite
needs **no credentials configured at all**, so a fork pull request runs the full
gate with nothing injected.

The lockout itself is asserted deliberately, because behaviour a suite can break
itself on is behaviour worth a test. It is marked `destructive`, owns the account
it burns, and asserts both halves: that the lockout trips, and that the correct
password is then refused with 423.

### "Assert zero console errors" does not survive contact with a real app

The catalogue page fires an authenticated request while signed out and logs the
resulting 401 on every anonymous load. That is the application's own behaviour.

A blanket empty assertion would be red on every run and deleted within a week,
taking the useful part of the check with it.
`support/console_error_policy.py` holds a reviewed allowlist instead, **each
entry carrying its reason**. The `unauthorized` entry matches the exact observed
string rather than the word alone, so a genuine authorization defect logged in
different words still fails.

### Reading a collection of elements is a race if you count first

`HomePage.visible_product_names()` and
`ProductDetailPage.specification_names()` use `all_inner_texts()`, which
resolves the whole set in **one** call. The count-then-index version takes the
count against the grid as it is now, and if the grid re-renders mid-loop — which
it does after a search or a page change — `nth(i)` waits for an element that no
longer exists and the test times out. The Java module hit exactly that.

The search test also waits on the observable end state before enumerating:

```python
expect(home.product_names.first).to_be_visible()  # passes instantly — the OLD grid
expect(home.product_names.first).to_contain_text(term)  # retries until the search rendered
```

The first assertion alone is a trap: it is satisfied by the pre-search grid.

### Pydantic does not keep a JSON number's trailing zero

`{"price": 14.10}` parses to `Decimal('14.1')`, not `Decimal('14.10')`. This was
probed rather than assumed, because C# is safe here for a C#-specific reason —
`decimal` carries its own scale. A bare `str()` on the parsed value would render
`14.1` against a detail page showing `14.10` and fail for a formatting reason
rather than a functional one, so `test_opens_detail_page_matching_the_card`
quantizes to two places and says why: this is money, and the page renders money
to the cent.

Reading the price off the page would be the other way to make it pass, and it is
forbidden. Expectations come from the API; a UI test that derives its
expectation from the same page it is checking proves only that the page agrees
with itself.

---

## Test design notes

**No hardcoded product ids.** The demo data is reseeded periodically — ids
captured one hour return 404 the next. Every test fetches an id from the
catalogue first.

**Invariants, not magic numbers.** The catalogue holds 50 products today. No
test asserts that. They assert what is actually promised: page size is
respected, `from`/`to` agree with the page contents, `last_page` follows from
`total`, and no product appears on two pages. Those hold whatever the data does.

**Observed behaviour, not preferred behaviour.** A login request with the
`password` field missing returns **401**, not the 422 a validation failure would
normally produce. The test asserts 401 and the inconsistency is recorded in
[`shared/contracts/README.md`](../shared/contracts/README.md) to raise with the
API owners.

**Response models are permissive; the schemas are strict.** Every model sets
`extra="ignore"` and none sets `strict=True`. Neither shipped module rejects
unknown members, and all four schemas in `shared/contracts/` already set
`additionalProperties: false`, so additive drift is caught once, in the suite
whose job that is, from a definition all three modules read. A Python-only
`forbid` would mean the day the demo target adds a field, eleven Python API
tests go red while Java and C# stay green.

**Retries are transport-level only.** `httpx.HTTPTransport(retries=2)` retries
connection-establishment failures and never replays a request that reached the
server, so a 4xx or 5xx is never retried. 5xx is deliberately **not** retried:
neither shipped module retries above the transport, and a 5xx from the shared
demo target is a result the team wants to see rather than smooth over.

---

## Known gaps

Honest list of what this module does not have, and why.

- **Not wired into CI yet.** `.github/workflows/ci.yml` is owned elsewhere; see
  [Follow-ups](#follow-ups-owned-outside-this-module) for exactly what the job
  needs.
- **`ProductsClient.create`, `delete_ignoring_missing` and `list_by_brand` are
  not ported.** All three exist in both shipped clients and are called by no
  test in either module. The Python client surface is exactly what the 34 tests
  call; porting an unexercised request shape would spread dead surface to a
  third module. Whichever test first needs one adds it in the same PR, which is
  when its shape can be checked against a real call.
- **`HomePage.visible_product_count()` is not ported.** C# has it as a one-liner
  over `ProductNames.CountAsync()`, Java does not have it, and no test calls it.
  It is named here so nobody adds it "for parity": `.count()` appears nowhere in
  `python/`, and that absence is a verification step.
- **`ProductSpec` has no `value_as_text()` helper.** C# models `spec_value` as a
  `JsonElement` and needs the helper to read it; the Pydantic union
  `str | float | None` is already readable, and nothing asserts on the value
  numerically.
- **Page objects keep locators and actions no test calls.** Deliberate, and the
  opposite of the client-layer rule above: a page object documents a screen, so
  the next test to need a control reads its test id off the page object instead
  of rediscovering it in the DOM, and a locator costs one line that cannot rot
  silently — if the test id changes, the test that uses it fails. An unexercised
  request shape has no such property.
- **Registered accounts are never deleted.** The demo API offers no self-delete.
  Every address is `af-{runId}-{processTag}-{n}@example.invalid`, so the `af-`
  prefix and the embedded run id let a janitor find them; a real project
  registers cleanup at creation time.
- **No cross-tenant test.** The demo has roles but not tenants, so the
  highest-value authorization case has nowhere to run here.
- **No Testcontainers usage.** `tech.md` lists it, but there is nothing to stand
  up against a hosted demo — the same position Java and C# are in.
- **Chromium only.** Firefox and WebKit belong in a scheduled job. Both are
  already supported by `AF_BROWSER`.
- **No accessibility scan.** `axe-core` would slot into
  `test_product_browsing.py`.
- **No visual tests.** Deliberate — they need a controlled environment.

---

## Follow-ups owned outside this module

This module touches no file outside `python/`. The table below is what the
orchestrator owns, recorded here so the hand-off is committed rather than only
spoken.

| File | What it needs |
| --- | --- |
| `.github/workflows/ci.yml` | A `python` job: a `detect` output probing `python/pyproject.toml`; `astral-sh/setup-uv` with `cache-dependency-glob: python/uv.lock`; `uv python install 3.12`; `uv sync --directory python --locked`; the lint, format and `mypy src tests conftest.py` steps; a browser cache keyed on the `playwright==` version grepped out of `python/uv.lock`, sharing the key shape the other two jobs use; `playwright install --with-deps chromium`; a suite branch on `detect.outputs.suite` where every marker string carries `and not quarantine`, and every gating one also `and not destructive`; `junit_summary.py` over `python/reports/junit.xml`; report and failure-artifact uploads; and `python` added to `gate`'s needs and result loop with `skipped` still acceptable. The same `concurrency: demo-target-${{ github.run_id }}` group as the Java and C# jobs, because a third suite hitting the shared demo target concurrently is the same mistake at a larger scale. `AF_TIMEOUTS_ELEMENTMS: '30000'` is already set in the workflow-level `env:` block, so the job inherits it with nothing added |
| `README.md` | A Python section mirroring the Java and C# ones: the canonical commands, the `AF_*` switch table, the 34-case inventory, and the note that the suite needs no credentials |
| `docs/decisions/` | `0007-redaction-field-list-excludes-email-and-phone.md`. `test-data-and-secrets.md` names `email` and `phone` as keys to redact; all three modules deliberately do not, and that is a documented rule knowingly narrowed across the whole repo |
| `.kiro/steering/structure.md` | One clause extending the framework-internal-test paragraph, which currently names only "a `Support/` folder (C#) or `support/` package (Java)", to include `python/tests/support/` |
| `.kiro/steering/tech.md` | `jsonschema` in the Python row of the stack table. It fills a gap rather than replacing a choice — the table names a validator for C# and Java but none for Python |
| `.env.example` | One `AF_BROWSER=` entry under Execution. All three loaders read it and the file documents it nowhere. Nothing else: the four `AF_TIMEOUTS_*` variables and the `AF_RUN_ID`/`AF_DATA_SEED` process-environment note are already there |

**No ADR is warranted for the Python version.** `uv` supplies CPython 3.12, so
`tech.md`'s pin is honoured with no divergence to record. The reasoning in
`docs/decisions/0001` — the JDK genuinely could not be installed, so the
steering moved — does not apply here.
