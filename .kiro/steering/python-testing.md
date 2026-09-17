---
inclusion: fileMatch
fileMatchPattern: ["python/**", "**/*.py", "**/pyproject.toml", "**/conftest.py", "**/pytest.ini", "**/ruff.toml"]
---

# Python Automation Conventions

Stack: CPython 3.12, uv, pytest 8, Playwright for Python, httpx, Pydantic v2,
Faker, pytest-xdist, allure-pytest, Ruff, mypy (strict), Testcontainers.

## Project layout

```text
python/
├── pyproject.toml
├── uv.lock
├── conftest.py                     # root fixtures only
├── src/framework/
│   ├── support/    config.py, browser.py, waits.py, redaction.py, run_context.py
│   ├── models/     Pydantic models
│   ├── pages/      page + component objects
│   ├── clients/    httpx-based typed clients
│   └── flows/      business actions
└── tests/
    ├── ui/  api/  contract/
    └── each with its own conftest.py for scoped fixtures
```

Use a `src/` layout with the package installed in editable mode. No
`sys.path` manipulation, ever.

## pyproject essentials

```toml
[tool.pytest.ini_options]
addopts = "-ra --strict-markers --strict-config --import-mode=importlib"
testpaths = ["tests"]
markers = [
  "smoke: fast critical-path checks",
  "regression: full functional coverage",
  "contract: schema and contract verification",
  "slow: excluded from PR gate",
]
xfail_strict = true

[tool.ruff]
target-version = "py312"
line-length = 100
[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "PT", "RET", "ARG", "ASYNC", "S"]

[tool.mypy]
strict = true
warn_unreachable = true
```

`--strict-markers` and `xfail_strict` are mandatory: they turn typos and
silently-passing xfails into failures.

## Test structure

- Files `test_<feature>.py`, functions `test_<expected>_when_<condition>`.
- Plain functions, not classes, unless grouping shares a fixture — then a
  `class Test<Feature>` with no `__init__`.
- Mark suites with `@pytest.mark.smoke` etc. Select with `-m smoke`.
- Parameterize with `@pytest.mark.parametrize(..., ids=[...])`. Always supply
  `ids` so failures are readable.
- `pytest.param(..., marks=pytest.mark.xfail(reason="BUG-123"))` for known
  defects — with a ticket, and `xfail_strict` catches the fix.
- `@pytest.mark.skip` requires a reason with a ticket id.
- Docstring on the test names the requirement.

```python
@pytest.mark.regression
def test_rejects_payment_when_card_is_expired(checkout_flow, checkout_page):
    """ORD-142: expired cards must be rejected at payment."""
    customer = customer_builder().with_expired_card().build()

    checkout_flow.start(customer)

    assert checkout_page.payment_error_text() == "Your card has expired."
```

## Fixtures

- Name fixtures for what they provide (`authenticated_user`, `orders_client`),
  never `setup` / `fixture1`.
- Scope deliberately: `session` for the browser and config, `function` for
  context/page and any created data.
- Always use `yield` + teardown, and register cleanup as soon as the resource
  exists so it runs even if the test body fails.
- Root `conftest.py` holds only cross-suite fixtures. Push everything else to
  the nearest `conftest.py`.
- Fixtures that create data return the created object and delete it on
  teardown, tolerating "already deleted".
- With `pytest-xdist`, session fixtures run **once per worker**. Anything that
  must run truly once uses a file-lock guard (`tmp_path_factory.getbasetemp().parent`).

## Playwright for Python

- Use the sync API by default; it is simpler and pytest-native. Only use the
  async API if the suite is genuinely concurrent within a test.
- Do not rely on `pytest-playwright`'s default `page` fixture if you need
  custom context options — wrap it in your own fixture in `support/browser.py`.
- One `browser` per session, one `context`/`page` per test.
- `expect(locator).to_be_visible()` for UI state — it auto-retries.
  Bare `assert` is for plain values.
- Set the test id attribute once:
  `playwright.selectors.set_test_id_attribute("data-testid")`.
- Tracing on per test, saved only on failure via a `pytest_runtest_makereport`
  hook that exposes the phase result to fixtures.
- Never `page.wait_for_timeout` and never `time.sleep`.

## API clients with httpx

- One `httpx.Client` (or `AsyncClient`) per base URL, created in a session
  fixture with `base_url`, timeout from config, and an event hook for
  redacted request/response logging plus correlation id.
- Clients return parsed Pydantic models for success, and the raw `Response`
  (or a small `ApiResult`) so negative tests can assert on status.
- Do not set `raise_for_status` globally; that makes negative paths awkward.
- Retry only on transport errors and 5xx, with `httpx` transport retries or
  `tenacity` — never on 4xx.

## Models

- Pydantic v2 with `model_config = ConfigDict(extra="forbid")` in contract
  tests, `extra="ignore"` for workflow models.
- Use `Field(alias=...)` for wire names; keep Python names snake_case.
- Validate every response you assert on. An unvalidated `dict` is a defect.

## Typing

- Fully annotated: `mypy --strict` passes with no `# type: ignore` unless
  accompanied by a comment explaining the third-party gap.
- No `Any` in framework code. `TypedDict`/Pydantic instead of bare dicts.

## Readability: keep comprehensions simple

Python's comprehensions are its LINQ. One level is idiomatic and clear; two
levels with a condition is a puzzle.

```python
# Avoid
names = sorted(r.name.strip() for r in rows if r.is_active and r.region in allowed)

# Avoid worse
lookup = {k: [x.id for x in v if x.ok] for k, v in groups.items()}

# Prefer
names = []
for row in rows:
    if not row.is_active:
        continue
    if row.region not in allowed:
        continue
    names.append(row.name.strip())
names.sort()
```

Rules:

- One-level comprehension with at most one `if` is fine anywhere:
  `[o.id for o in orders]`, `[o for o in orders if o.is_paid]`.
- Nested comprehensions, dict comprehensions with a nested loop, and
  comprehensions spanning more than one line: use a loop instead.
- No `functools.reduce`. Write the loop.
- No `lambda` beyond a trivial key function (`key=lambda o: o.created_at`).
- No walrus operator in test code. It saves a line and costs a reader.
- No chained `map`/`filter`/`zip` pipelines.
- Long conditional expressions (`a if b else c if d else e`): use `if`/`elif`.

Other Python constructs to avoid in test code:

| Avoid                                        | Prefer                             |
| -------------------------------------------- | ---------------------------------- |
| Metaclasses, `__getattr__` magic, monkeypatching framework internals | Explicit code |
| Decorators that hide control flow             | A fixture, or a plain call         |
| `*args, **kwargs` pass-through in framework APIs | Named, typed parameters         |
| Dynamic imports, `getattr(module, name)`      | A direct import                    |
| Deeply chained `.get("a", {}).get("b", {})`   | A Pydantic model                   |
| Tuple unpacking of more than three values     | A `NamedTuple` or a model          |
| Clever `itertools` pipelines                  | A loop                             |

`pytest` parametrisation is the one place a small amount of density is worth
it, because the payoff in report clarity is large. Even there, keep the case
data as plain literals and give every case an explicit `id`.

## Anti-patterns specific to Python

- `time.sleep`, `page.wait_for_timeout`.
- `assert True` / assertions with no comparison.
- Bare `except:` or `except Exception: pass`.
- Module-level mutable globals holding driver or data state.
- `print` for diagnostics — use the `logging` module with the pytest
  `caplog`-friendly config.
- Building URLs with string concatenation instead of the client `base_url`.
- Fixtures with side effects but no teardown.
- `sys.path.append` or relative imports reaching outside the package.
