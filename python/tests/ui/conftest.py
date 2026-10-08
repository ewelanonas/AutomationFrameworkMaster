"""The browser stack, scoped so nothing outside ``tests/ui`` pays for a browser.

The support module is imported as ``browser_ns``. The alias exists because the
natural name ``browser`` collides with fixture names a reader expects in a
Playwright suite, and a module shadowed by a fixture argument is a confusing
``AttributeError`` at the worst moment.

**The teardown split follows from fixture ordering.** ``page`` depends on
``browser_context``, so ``page`` tears down **first**: live-page artifacts are
captured while the page still exists, and the context — the thing that owns the
trace — is still open when tracing stops.

``first_product_from_api`` deliberately does **not** live here. Both callers are
in ``test_product_browsing.py``, so it is a module-level helper in that file. If
``test_sign_in.py`` ever needs it, it moves here as a fixture beside
``auth_flow`` — never cross-imported from a test module.
"""

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from playwright.sync_api import (
    Browser,
    BrowserContext,
    ConsoleMessage,
    Page,
    Playwright,
)
from playwright.sync_api import Error as PlaywrightError

from framework.clients.auth_client import AuthClient
from framework.flows.auth_flow import AuthFlow
from framework.support import browser as browser_ns
from framework.support import repo_paths, reporting, run_context, test_log, waits
from framework.support.config import AppConfig


@pytest.fixture(scope="session")
def playwright_instance(app_config: AppConfig) -> Iterator[Playwright]:
    """Starts Playwright, then applies the two settings that must precede the browser.

    Both need config, which is why this fixture depends on it. The test id
    attribute has to be set before any locator resolves, and the assertion
    timeout before any ``expect()`` runs — Playwright's web-first assertions
    keep their own timeout and would otherwise silently stay on the built-in 5 s.
    """
    playwright = browser_ns.start_playwright()

    browser_ns.set_test_id_attribute(playwright, app_config)
    waits.apply_assertion_timeout(app_config.timeouts)

    yield playwright

    playwright.stop()


@pytest.fixture(scope="session")
def browser_instance(playwright_instance: Playwright, app_config: AppConfig) -> Iterator[Browser]:
    """One browser per session, which under xdist means one per worker."""
    browser = browser_ns.launch_browser(playwright_instance, app_config)
    yield browser
    browser.close()


@pytest.fixture
def console_errors() -> list[str]:
    """The raw list this test collected, passed into both page handlers."""
    return []


@pytest.fixture
def browser_context(
    browser_instance: Browser, app_config: AppConfig, request: pytest.FixtureRequest
) -> Iterator[BrowserContext]:
    """A fresh isolated context per test, with tracing started."""
    context = browser_ns.new_context(browser_instance, app_config)

    yield context

    # Tracing is started in new_context, so it is stopped here — including for a test that
    # takes the context and never opens a page. A tracing session left running is a
    # chromium process holding a growing buffer for the rest of the session.
    trace_path: Path | None = None
    if _test_failed(request):
        trace_path = _artifact_path(request.node.name, "trace.zip")

    browser_ns.stop_tracing(context, trace_path)
    context.close()

    if trace_path is not None:
        reporting.attach_file("Playwright trace", trace_path, "application/zip")
        test_log.info(
            f"Trace written to {trace_path}. Open it with: npx playwright show-trace {trace_path}"
        )


@pytest.fixture
def page(
    browser_context: BrowserContext,
    request: pytest.FixtureRequest,
    console_errors: list[str],
) -> Iterator[Page]:
    """The page for this test, with console and page-error recording attached."""
    current_page = browser_ns.new_page(browser_context)
    current_page.on("console", _record_console_message_into(console_errors))
    current_page.on("pageerror", _record_page_error_into(console_errors))

    yield current_page

    # Screenshot, DOM and diagnostics need a live page, so they happen here rather than
    # in the context teardown.
    if _test_failed(request):
        reporting.attach_failure_artifacts(current_page, console_errors, request.node.name)


@pytest.fixture
def auth_flow(auth_client: AuthClient) -> AuthFlow:
    """Signs a browser in over the API, for the test that skips the login form."""
    return AuthFlow(auth_client)


def _record_console_message_into(
    console_errors: list[str],
) -> Callable[[ConsoleMessage], None]:
    """A named handler, closed over this test's own list.

    The per-test list is passed in explicitly rather than reached for through a
    global, which is the same choice ``BrowserExtension.java`` documents.
    """

    def record_console_message(message: ConsoleMessage) -> None:
        if message.type == "error":
            console_errors.append(message.text)

    return record_console_message


def _record_page_error_into(console_errors: list[str]) -> Callable[[PlaywrightError], None]:
    """``pageerror`` needs its own handler, and ``console_errors.append`` is not it.

    Playwright for Python emits an ``Error`` object to ``pageerror``, not a
    string — unlike Playwright for .NET, where ``IPage.PageError`` is
    ``EventHandler<string>``, and unlike Playwright for Java's
    ``Consumer<String>``. Binding ``list[str].append`` to the event fails twice:
    ``mypy --strict`` rejects it, and at runtime an uncaught page error would
    put an ``Error`` into a ``list[str]``, after which the console allowlist
    raises ``AttributeError`` while lowercasing it — failing the console-error
    test for a reason that has nothing to do with the console.
    """

    def record_page_error(error: PlaywrightError) -> None:
        console_errors.append(error.message)

    return record_page_error


def _test_failed(request: pytest.FixtureRequest) -> bool:
    """True when either the setup phase or the test body failed.

    Both phases count, and setup is the one that is easy to forget: a fixture
    ordered after ``page`` that fails — ``disposable_account`` hitting a 409 or
    a 423, ``sign_in_via_api`` raising on a rejected login — leaves a live page
    worth photographing, and that is the case where a screenshot explains most.
    Reading only ``rep_call`` reports those as errors with no artifacts at all.

    This also keeps parity with C#: ``UiTestBase`` checks the NUnit *result*,
    which is ``Failed`` for a failed ``[SetUp]`` too. ``rep_teardown`` is
    deliberately not read — by the time it exists these teardowns have already
    run.
    """
    for attribute in ("rep_setup", "rep_call"):
        report = getattr(request.node, attribute, None)
        if report is not None and report.failed:
            return True
    return False


def _artifact_path(test_name: str, file_name: str) -> Path:
    """``python/reports/failure-artifacts/<runId>/<safe-test-name>/<file>``."""
    directory = (
        repo_paths.reports()
        / "failure-artifacts"
        / run_context.run_id()
        / _safe_file_name(test_name)
    )
    directory.mkdir(parents=True, exist_ok=True)
    return directory / file_name


def _safe_file_name(test_name: str) -> str:
    """Lowercase, letters and digits only, everything else collapsed to one dash.

    Mirrors ``UiTestBase.SafeFileName``, and matters more here than in C#: a
    pytest node id carries its parametrisation in brackets —
    ``test_echoes_requested_page_number[page-2]`` — and those characters are not
    all path-safe. Collapsing keeps one readable directory per case.
    """
    safe: list[str] = []
    for character in test_name.lower():
        if character.isalnum():
            safe.append(character)
        elif len(safe) > 0 and safe[-1] != "-":
            safe.append("-")
    return "".join(safe).strip("-")
