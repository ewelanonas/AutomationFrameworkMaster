"""Owns the Playwright, browser, context and page lifecycle.

The fixtures in ``tests/ui/conftest.py`` are thin wrappers over these
functions.

Two constraints drive the design:

- ``sync_playwright().start()`` starts a Node driver process and costs seconds.
  Doing it per test would dominate the run, so one ``Playwright`` and one
  ``Browser`` are shared per session (which, under xdist, means per worker).
- A ``BrowserContext`` is cheap and gives complete isolation: separate cookies,
  storage and cache. That is why each test gets a fresh one. Sharing a page
  across tests is the cause of the classic "fails only when it runs second"
  flake.

**Tracing is always started and only ever saved on failure.** Starting it
conditionally would mean the first failure is the one run with no trace, which
is precisely the run you need. Whoever starts tracing stops it: tracing starts
in :func:`new_context`, so it is stopped in the ``browser_context`` fixture's
teardown — not in the ``page`` teardown, which would leave a tracing session
running for any test that used the context without opening a page.
"""

from pathlib import Path

from playwright.sync_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    sync_playwright,
)
from playwright.sync_api import Error as PlaywrightError

from framework.support import test_log
from framework.support.config import AppConfig


def start_playwright() -> Playwright:
    """Starts the driver process. Stopped by the fixture that started it."""
    return sync_playwright().start()


def set_test_id_attribute(playwright: Playwright, config: AppConfig) -> None:
    """Applies the configured test id attribute once, right after Playwright starts.

    The attribute is per-application, so it comes from config rather than being
    hardcoded: this repo's demo target uses ``data-test``, not ``data-testid``.
    """
    playwright.selectors.set_test_id_attribute(config.execution.test_id_attribute)


def launch_browser(playwright: Playwright, config: AppConfig) -> Browser:
    """Launches the configured browser."""
    name = config.execution.browser.strip().lower()

    # Disabling animations removes a whole class of "fails as the modal appears" flake.
    launch_args = ["--force-prefers-reduced-motion"]

    if name == "chromium":
        browser = playwright.chromium.launch(headless=config.execution.headless, args=launch_args)
    elif name == "firefox":
        browser = playwright.firefox.launch(headless=config.execution.headless, args=launch_args)
    elif name == "webkit":
        browser = playwright.webkit.launch(headless=config.execution.headless, args=launch_args)
    else:
        raise ValueError(
            f"Unsupported browser '{config.execution.browser}'. Use chromium, firefox or webkit."
        )

    test_log.info(f"Launched {name} (headless={config.execution.headless}).")
    return browser


def new_context(browser: Browser, config: AppConfig) -> BrowserContext:
    """A fresh, isolated context for one test, with tracing already started."""
    context = browser.new_context(
        base_url=config.ui.base_url,
        viewport={"width": config.ui.viewport_width, "height": config.ui.viewport_height},
        locale=config.ui.locale,
        timezone_id=config.ui.timezone_id,
    )

    context.set_default_timeout(config.timeouts.element_ms)
    context.set_default_navigation_timeout(config.timeouts.navigation_ms)

    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    return context


def new_page(context: BrowserContext) -> Page:
    """A page in this test's own context."""
    return context.new_page()


def stop_tracing(context: BrowserContext, trace_path: Path | None) -> None:
    """Stops tracing, writing the trace file only when ``trace_path`` is set.

    Tolerant of an already-closed context: when a test fails because the browser
    died, stopping the trace throws as well, and a teardown that throws replaces
    the real failure in the report with a confusing secondary one. Passing
    ``None`` stops tracing and discards the recording, which is what makes
    "always traced, saved only on failure" true for every exit path.
    """
    try:
        if trace_path is None:
            context.tracing.stop()
        else:
            context.tracing.stop(path=trace_path)
    except PlaywrightError as error:
        test_log.warn(f"Could not stop tracing: {error.message}")
