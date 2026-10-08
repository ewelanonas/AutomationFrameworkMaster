"""Cross-suite hooks and fixtures.

Everything here is used by more than one suite. Anything used by one suite
lives in that suite's own ``conftest.py`` — in particular the whole browser
stack, which is in ``tests/ui/conftest.py`` so nothing outside ``tests/ui``
pays for a browser.

A conftest never imports anything under ``tests/``; it imports only from
``framework.*``.
"""

import os
from collections.abc import Generator, Iterator
from pathlib import Path

import httpx
import pytest
from filelock import FileLock

from framework.clients.auth_client import AuthClient
from framework.clients.products_client import ProductsClient
from framework.clients.users_client import UsersClient
from framework.flows.account_flow import AccountFlow
from framework.models.test_account import TestAccount
from framework.support import api_http, repo_paths, reporting, run_context, test_log, test_values
from framework.support.config import AppConfig, load_config


def pytest_configure(config: pytest.Config) -> None:
    """Five things, in exactly this order. The order is behaviour, not taste.

    A log line emitted before the handler exists is dropped silently, and the
    two lines emitted below are the evidence that the resolved timeout and the
    data seed are what the run actually used.
    """
    # First because it needs no logger, and because every later step assumes
    # python/ is the working directory.
    _fail_unless_invoked_from_the_module_directory(config)

    reporting.configure_logging()

    # On the controller, before xdist spawns anything: execnet's popen gateway inherits
    # os.environ, so pinning the id here is what makes every worker agree on it. In a
    # worker the variable is already set and this is a no-op. The process tag is
    # deliberately NOT pinned — that is what keeps generated emails unique per worker.
    os.environ.setdefault("AF_RUN_ID", run_context.run_id())

    test_values.log_seed()

    # Resolving config here, rather than lazily in the first fixture that needs it, is
    # what makes a misconfigured environment fail once, up front, with a message naming
    # the missing key, instead of inside every test as a puzzling 401.
    load_config()


def pytest_runtest_setup(item: pytest.Item) -> None:
    test_log.begin_scope(item.name)


def pytest_runtest_logfinish() -> None:
    """Clears the test scope after everything for this test has run.

    The scope must outlive fixture teardown: the ``Trace written to ...`` line
    and the ``stop_tracing`` / ``_try_capture`` warnings are written during
    teardown and are exactly the lines a reader needs the ``[test]`` field on.
    Clearing from a teardown hook would strip it from them.

    Declared with no parameters because pluggy passes only the arguments a hook
    asks for, which also keeps Ruff's ARG001 quiet.
    """
    test_log.end_scope()


@pytest.hookimpl(wrapper=True, tryfirst=True)
def pytest_runtest_makereport(
    item: pytest.Item, call: pytest.CallInfo[None]
) -> Generator[None, pytest.TestReport, pytest.TestReport]:
    """Exposes each phase's result on the item, so fixtures can see what happened.

    ``wrapper=True`` rather than the older ``hookwrapper=True``: pytest 8 hands
    the report straight back from ``yield``, which types cleanly, where the
    legacy form yields a ``pluggy.Result`` that ``mypy --strict`` cannot see
    without importing a package this module does not declare. Same hook, same
    behaviour.

    ``call`` is genuinely used — it is what names the phase — so no lint
    suppression is needed here.
    """
    report = yield
    setattr(item, "rep_" + call.when, report)
    return report


def _fail_unless_invoked_from_the_module_directory(config: pytest.Config) -> None:
    """One supported way to launch the suite, because artifacts land in one place.

    ``--alluredir`` is resolved by ``allure-pytest`` against the *invocation*
    directory while ``repo_paths.reports()`` is anchored to the repo root. Launch
    from anywhere but ``python/`` and the two diverge: Allure reads the directory
    with no ``environment.properties`` and the report is quietly wrong, which is
    the worst kind of wrong.

    There is deliberately no override. IDE and editor test runners must set the
    working directory to ``python/``; the alternative is artifacts in two places.
    """
    invocation_dir = Path(config.invocation_params.dir)
    module_dir = Path(config.rootpath)

    if invocation_dir == module_dir:
        return

    raise pytest.UsageError(
        f"This suite must be invoked from {module_dir}, but was invoked from "
        f"{invocation_dir}. Run it as: uv run --directory python pytest . "
        "An IDE or editor test runner must set its working directory to python/ for the "
        "same reason: --alluredir resolves against the invocation directory, so launching "
        "from elsewhere splits the report across two directories."
    )


def _allure_results_dir(config: pytest.Config) -> Path:
    """Where allure-pytest is actually writing, not where we assume it is.

    ``Path(a) / b`` returns ``b`` unchanged when ``b`` is absolute, so an
    absolute ``--alluredir`` is honoured without a branch. Reading the option is
    safe; *rewriting* it from a conftest hook would not be — hook ordering
    between a conftest and an entry-point plugin is not something a test
    framework should bet its report directory on.
    """
    configured = config.getoption("--alluredir")

    if configured is None or str(configured).strip() == "":
        return repo_paths.reports() / "allure-results"

    return Path(config.invocation_params.dir) / str(configured)


def _run_scoped_shared_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A directory shared by every process of THIS run, and by no other run.

    Under xdist, ``getbasetemp()`` is the worker's own directory and its parent
    is the run's. Without xdist, ``getbasetemp()`` is already the run's and its
    parent is the machine-wide ``pytest-of-<user>``, which outlives every run —
    so a marker written there would stop run metadata ever being rewritten.
    """
    base = tmp_path_factory.getbasetemp()

    if os.environ.get("PYTEST_XDIST_WORKER") is not None:
        return base.parent

    return base


@pytest.fixture(scope="session")
def app_config() -> AppConfig:
    """The resolved configuration for this process."""
    return load_config()


@pytest.fixture(scope="session", autouse=True)
def run_metadata(
    app_config: AppConfig,
    pytestconfig: pytest.Config,
    tmp_path_factory: pytest.TempPathFactory,
) -> Path:
    """Writes the Allure environment block and categories, exactly once per run.

    ``autouse`` is what makes this run **at all**: nothing else requests it, and
    a fixture nobody requests never runs. Without it the suite stays green while
    the Allure report silently loses its environment block and its categories —
    a failure mode invisible from the test results, which is why it is worth the
    one autouse the rest of this module avoids.

    Session scope means once per *worker*, not once per run, so N workers
    writing into the same directory is a genuine race: a half-written properties
    file is what Allure then reads. The lock serialises the workers and the
    marker stops the second one repeating the work.
    """
    results_dir = _allure_results_dir(pytestconfig)
    results_dir.mkdir(parents=True, exist_ok=True)

    shared_dir = _run_scoped_shared_dir(tmp_path_factory)
    marker = shared_dir / "allure-metadata.done"

    with FileLock(str(shared_dir / "allure-metadata.lock")):
        if not marker.exists():
            reporting.write_run_metadata(results_dir, app_config)
            marker.write_text("done", encoding="utf-8")

    return results_dir


@pytest.fixture(scope="session")
def api_client() -> Iterator[httpx.Client]:
    """The shared client, closed on teardown.

    The cache is cleared **after** closing, in that order: a ``functools.cache``
    still holding a closed client would hand it out to anything that asked
    afterwards.
    """
    client = api_http.client()
    yield client
    client.close()
    api_http.client.cache_clear()


@pytest.fixture
def products_client(api_client: httpx.Client) -> ProductsClient:
    """Function-scoped over a session-scoped client.

    The client holds the connection pool and is the expensive thing; the typed
    wrappers are three-line objects. Function scope keeps them free of shared
    mutable state.
    """
    return ProductsClient(api_client)


@pytest.fixture
def auth_client(api_client: httpx.Client) -> AuthClient:
    return AuthClient(api_client)


@pytest.fixture
def users_client(api_client: httpx.Client) -> UsersClient:
    return UsersClient(api_client)


@pytest.fixture
def account_flow(users_client: UsersClient) -> AccountFlow:
    return AccountFlow(users_client)


@pytest.fixture
def disposable_account(account_flow: AccountFlow) -> TestAccount:
    """A fresh account this test owns outright.

    There is deliberately **no** shared-account or configured-account fixture:
    you cannot misuse a fixture that does not exist. Every test that
    authenticates registers its own, which costs a few hundred milliseconds and
    buys complete isolation.
    """
    return account_flow.create_customer()
