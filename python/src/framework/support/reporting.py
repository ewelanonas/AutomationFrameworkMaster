"""Logging setup, the Allure run metadata, and failure artifacts.

Four responsibilities. :func:`configure_logging` is called from
``pytest_configure``, before anything else runs; the other three are called
from fixtures.

Everything attached goes through redaction: text through ``redaction.text``,
bodies through ``redaction.body``. **No HAR is recorded and none is uploaded**
— HARs capture headers and scrubbing them is work this module does not need to
do.
"""

import json
import logging
import os
import platform
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import TextIO

import allure
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page

from framework.support import redaction, run_context, test_log, test_values
from framework.support.config import AppConfig

# A port of java/src/test/resources/allure-categories.json with the Python exception
# names substituted. Same six buckets, same intent.
_CATEGORIES: list[dict[str, object]] = [
    {
        "name": "Product defect",
        "matchedStatuses": ["failed"],
        "messageRegex": ".*AssertionError.*|.*assert.*",
    },
    {
        "name": "Test defect",
        "matchedStatuses": ["broken"],
        "messageRegex": ".*TimeoutError.*|.*PlaywrightError.*|.*AttributeError.*",
    },
    {
        "name": "Contract drift",
        "matchedStatuses": ["failed"],
        "messageRegex": ".*schema.*|.*additionalProperties.*|.*required property.*",
    },
    {
        "name": "Environment problem",
        "matchedStatuses": ["broken", "failed"],
        "messageRegex": ".*ConnectError.*|.*ConnectTimeout.*|.*502.*|.*503.*",
    },
    {
        "name": "Missing configuration",
        "matchedStatuses": ["broken"],
        "messageRegex": ".*Configuration is incomplete.*"
        "|.*needs a credential that is not configured.*",
    },
    {
        "name": "Quarantined",
        "matchedStatuses": ["skipped"],
    },
]


class FrameworkLogHandler(logging.StreamHandler[TextIO]):
    """The suite's one handler.

    A named subclass rather than a flag on a ``StreamHandler`` instance, so
    :func:`configure_logging` can recognise its own handler with ``isinstance``
    instead of reaching for an attribute ``logging`` does not reserve.
    """


def configure_logging() -> None:
    """Installs the handler, filter and format once.

    Idempotent: a second call adds no duplicate handler, which keeps an xdist
    worker from doubling every line.
    """
    logger = logging.getLogger(test_log.LOGGER_NAME)

    for existing in logger.handlers:
        if isinstance(existing, FrameworkLogHandler):
            return

    handler = FrameworkLogHandler(stream=sys.stderr)
    handler.setFormatter(logging.Formatter(test_log.LOG_FORMAT))
    handler.addFilter(test_log.RunContextFilter())

    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def write_run_metadata(results_dir: Path, config: AppConfig) -> None:
    """Writes Allure's ``environment.properties`` and ``categories.json``.

    Takes the results directory as a parameter rather than computing it, because
    ``allure-pytest`` resolves ``--alluredir`` against the invocation directory
    and the ``run_metadata`` fixture owns that decision. Takes the config it
    needs rather than letting the fixture carry an unused parameter.

    The property keys are fixed because two verification checks read them back:
    ``elementMs`` is the resolved value including any ``AF_TIMEOUTS_ELEMENTMS``
    override, and ``dataSeed`` is the seed ``test_values`` resolved. That makes
    this file — a real artifact on disk, written once per run — the primary
    evidence for both, independent of whether a log line survives pytest's
    capture.
    """
    results_dir.mkdir(parents=True, exist_ok=True)

    properties = {
        "envName": config.env_name,
        "uiBaseUrl": config.ui.base_url,
        "apiBaseUrl": config.api.base_url,
        "browser": config.execution.browser,
        "headless": str(config.execution.headless).lower(),
        "elementMs": str(config.timeouts.element_ms),
        "runId": run_context.run_id(),
        "processTag": run_context.process_tag(),
        "dataSeed": str(test_values.seed()),
        "pythonVersion": platform.python_version(),
    }

    lines: list[str] = []
    for key, value in properties.items():
        lines.append(f"{key}={value}")

    (results_dir / "environment.properties").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (results_dir / "categories.json").write_text(
        json.dumps(_CATEGORIES, indent=2) + "\n", encoding="utf-8"
    )


def attach_failure_artifacts(page: Page, console_errors: Sequence[str], test_name: str) -> None:
    """Screenshot, DOM snapshot and a diagnostics blob, each isolated from the others."""

    def capture_screenshot() -> None:
        png = page.screenshot(full_page=True, type="png")
        allure.attach(png, name="Screenshot at failure", attachment_type=allure.attachment_type.PNG)

    def capture_page_html() -> None:
        html = redaction.body(page.content())
        if html is None:
            html = ""
        allure.attach(
            html, name="Page HTML at failure", attachment_type=allure.attachment_type.HTML
        )

    def capture_diagnostics() -> None:
        allure.attach(
            _diagnostics_report(page, console_errors, test_name),
            name="Failure diagnostics",
            attachment_type=allure.attachment_type.TEXT,
        )

    _try_capture("a screenshot", capture_screenshot)
    _try_capture("page HTML", capture_page_html)
    _try_capture("failure diagnostics", capture_diagnostics)


def attach_file(name: str, path: Path, mime: str) -> None:
    """Attaches a file from disk. Used for the Playwright trace zip."""

    def capture_file() -> None:
        # The suppression below covers a third-party gap: allure_commons ships py.typed
        # but leaves attach.file unannotated, because `attach` is a function object with
        # `.file` assigned onto it. There is no stub package to install instead.
        # Allure prepends the dot itself, so the suffix is passed without one. Passing
        # path.suffix verbatim produces "...-attachment..zip".
        allure.attach.file(  # type: ignore[no-untyped-call]
            str(path), name=name, attachment_type=mime, extension=path.suffix.lstrip(".")
        )

    _try_capture(name, capture_file)


def _diagnostics_report(page: Page, console_errors: Sequence[str], test_name: str) -> str:
    lines = [
        f"test: {test_name}",
        f"runId: {run_context.run_id()}",
        f"processTag: {run_context.process_tag()}",
    ]

    worker = os.environ.get("PYTEST_XDIST_WORKER")
    if worker is None:
        worker = "(no xdist)"
    lines.append(f"worker: {worker}")

    try:
        lines.append(f"url: {page.url}")
        lines.append(f"title: {page.title()}")
    except PlaywrightError as error:
        # Expected when the page has already closed. The rest of the report is still
        # worth having, which is why this is caught here rather than abandoning it all.
        lines.append(f"url/title unavailable: {error.message}")

    lines.append(f"browser console errors: {len(console_errors)}")
    for error_text in console_errors:
        lines.append(f"  - {error_text}")

    safe = redaction.text("\n".join(lines))
    if safe is None:
        return ""
    return safe


def _try_capture(what: str, capture: Callable[[], None]) -> None:
    """Runs an artifact capture, degrading to a warning rather than replacing the failure.

    This is the **one** broad catch in the module, and it carries the same
    justification as ``UiTestBase.TryCaptureAsync``: when the browser has
    already closed, an attachment call throws from teardown and the runner then
    reports *that* alongside the real assertion failure — the diagnostic path
    becomes the headline. Each capture is isolated from the others so losing the
    screenshot does not cost the diagnostics.
    """
    try:
        capture()
    except Exception as error:
        test_log.warn(f"Could not capture {what}: {type(error).__name__}: {error}")
