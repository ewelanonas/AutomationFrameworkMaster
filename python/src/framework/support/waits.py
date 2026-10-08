"""The timeout policy's one application point for web-first assertions.

Playwright's ``expect()`` keeps its **own** timeout, separate from the context
default that ``browser.new_context`` sets. Without the call below, web-first
assertions silently stay on the built-in 5 s whatever the timeout policy says —
which is not theoretical: a sign-in test failed with
"Expect to_have_url with timeout 5000ms" while config asked for 10 s, because
the login round-trip takes longer than 5 s under parallel workers.

One timeout policy is only one policy if every waiting mechanism reads from it.
All three modules now set this; Java's ``PlaywrightFactory`` calls
``setDefaultAssertionTimeout``, so this is parity rather than a Python
improvement.

This module contains **no polling helper and no sleep**. Nothing in the test
inventory needs a polled predicate, and "abstraction added for later" is on the
anti-pattern list. When a polled API predicate is genuinely needed it belongs
here, with a timeout and a clear failure message, and nowhere else.
"""

from playwright.sync_api import expect

from framework.support.config import Timeouts


def apply_assertion_timeout(timeouts: Timeouts) -> None:
    """Points Playwright's web-first assertions at the configured element timeout."""
    expect.set_options(timeout=timeouts.element_ms)
