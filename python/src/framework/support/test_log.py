"""Structured logging for the suite, with per-test attribution.

With parallel execution, lines from several tests interleave into one stream.
Without a per-test marker on every line that stream is unreadable exactly when
it matters, which is why every line carries the run id and the current test
name. The ``contextvars.ContextVar`` holding the test name is the Python
equivalent of C#'s ``AsyncLocal`` and Java's MDC.

Every message passes through :func:`redaction.text` **inside the adapter**, not
at the call site. One choke point is the only way to be confident nothing slips
through. ``print`` is banned by Ruff's ``T20`` and would bypass the adapter
anyway.

**Handler installation happens once, as the first logging-dependent statement
of ``pytest_configure``** — never from a fixture. This is the one ordering rule
in the module that cannot be relaxed: Python drops a sub-WARNING record with no
handler attached silently (``logging.lastResort`` is WARNING-level), so a
``test_log.info(...)`` emitted before ``reporting.configure_logging()`` simply
never appears. Two startup lines depend on it and both are evidence that a
defect fix works: the ``Environment '...' resolved ... elementMs=...`` line and
the ``Test data seed: ...`` line. C# does not have this hazard, because
``TestLog`` writes to a sink that is live from process start, which is exactly
why it is easy to port the code and lose the behaviour.

**The test scope must outlive fixture teardown.** :func:`end_scope` is called
from ``pytest_runtest_logfinish``, not from a teardown hook, because the
``Trace written to ...`` line and the ``stop_tracing`` / ``_try_capture``
warnings are written during fixture teardown and are exactly the lines a reader
needs the ``[test]`` field on.
"""

import contextvars
import logging

from framework.support import redaction, run_context

LOGGER_NAME = "framework"
LOG_FORMAT = "%(asctime)s %(levelname)-5s [%(run_id)s] [%(test)s] %(message)s"

_current_test: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "framework_current_test", default=None
)


class RunContextFilter(logging.Filter):
    """Injects the run identity and the current test name into every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.run_id = run_context.run_id()
        record.process_tag = run_context.process_tag()
        current = _current_test.get()
        if current is None:
            record.test = "setup"
        else:
            record.test = current
        return True


def begin_scope(test_name: str) -> None:
    """Associates subsequent log lines with a test name."""
    _current_test.set(test_name)


def end_scope() -> None:
    """Clears the test scope. A leaked value gets attributed to whichever test runs next."""
    _current_test.set(None)


def info(message: str) -> None:
    _write(logging.INFO, message)


def warn(message: str) -> None:
    _write(logging.WARNING, message)


def debug(message: str) -> None:
    _write(logging.DEBUG, message)


def _write(level: int, message: str) -> None:
    # Redacted on the way out, not at every call site.
    safe = redaction.text(message)
    if safe is None:
        safe = ""
    logging.getLogger(LOGGER_NAME).log(level, safe)
