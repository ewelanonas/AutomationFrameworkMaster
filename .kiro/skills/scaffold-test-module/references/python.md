# Python Module Setup

## Create the module

```powershell
New-Item -ItemType Directory -Path python -Force
uv init --directory python --package --name framework
uv add --directory python pytest pytest-xdist playwright pytest-playwright httpx pydantic faker allure-pytest
uv add --directory python --dev ruff mypy types-requests
uv run --directory python playwright install --with-deps
```

Use a `src/` layout. The package is installed in editable mode by `uv sync`, so
imports work without any `sys.path` manipulation.

## pyproject.toml

```toml
[project]
name = "framework"
requires-python = "==3.12.*"

[tool.pytest.ini_options]
addopts = "-ra --strict-markers --strict-config --import-mode=importlib --alluredir=reports/allure-results"
testpaths = ["tests"]
xfail_strict = true
markers = [
  "smoke: fast critical-path checks",
  "regression: full functional coverage",
  "contract: schema and contract verification",
  "quarantine: known-unstable, excluded from gating",
]

[tool.ruff]
target-version = "py312"
line-length = 100
[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "PT", "RET", "ARG", "ASYNC", "S", "T20"]
[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]      # assert is expected in tests

[tool.mypy]
strict = true
warn_unreachable = true
```

`T20` bans `print`. `S` catches hardcoded secrets and unsafe calls. Keep both.

## conftest.py structure

Root `conftest.py` holds only cross-suite fixtures:

```python
@pytest.fixture(scope="session")
def config() -> Config:
    return load_config()          # fails fast on missing keys

@pytest.fixture(scope="session")
def browser_ctx_args(config): ...

@pytest.fixture
def page(browser, config, request):
    context = browser.new_context(storage_state=config.auth.storage_state_path)
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()

    yield page

    report = getattr(request.node, "rep_call", None)
    if report is not None and report.failed:
        context.tracing.stop(path=trace_path(request))
    else:
        context.tracing.stop()
    context.close()
```

Expose the phase result to fixtures with the standard hook:

```python
@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    setattr(item, f"rep_{call.when}", outcome.get_result())
```

Put UI-only fixtures in `tests/ui/conftest.py`, API-only in `tests/api/conftest.py`.

## xdist caveat

Session fixtures run **once per worker**. For anything that must happen exactly
once per run (auth token, seed data), guard with a file lock in the shared
temp directory:

```python
root = tmp_path_factory.getbasetemp().parent
with FileLock(str(root / "auth.lock")):
    ...
```

## Playwright

- Sync API by default. Set the test id attribute once in a session fixture:
  `playwright.selectors.set_test_id_attribute("data-testid")`.
- One `browser` per session, one context and page per test.
- `expect(locator).to_be_visible()` for UI state. Bare `assert` for values.

## Failure artifacts

In the `page` fixture teardown (and an API equivalent), on failure attach
screenshot, `page.content()`, and the trace path with
`allure.attach` / `allure.attach.file`. Include the correlation id in the
attachment name.

## Config

`support/config.py` builds a Pydantic `Settings` model from
`shared/environments/<env>.json` plus `AF_*` environment variables via
`pydantic-settings`, validating on construction. `AF_ENV` selects; default
`local`.

## Logging

`logging` with a `logging.Filter` injecting the correlation id from a
`contextvars.ContextVar`. Configure via `log_cli` in pytest only for local
debugging; structured JSON handler when `CI` is set.

## Verify

```powershell
uv sync --directory python
uv run --directory python ruff check . ; uv run --directory python ruff format --check .
uv run --directory python mypy src tests
uv run --directory python pytest -m smoke -n auto --junitxml=reports/junit.xml
```

Confirm `python/reports/junit.xml` and `python/reports/allure-results/` exist.
