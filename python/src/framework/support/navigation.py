"""The single navigation policy every page object uses.

Centralised for the same reason the timeout policy is: when navigation
behaviour needs to change, it should change in one place rather than in every
page object. Nothing else in this module calls ``page.goto``.

The policy waits for ``domcontentloaded`` rather than the default ``load``.
Against a single-page application that difference matters. ``load`` waits for
every subresource, and this application's client-side router frequently
supersedes the initial navigation before those finish — which surfaces as
``net::ERR_ABORTED`` on a page that in fact rendered perfectly well. That
failure is a race in the waiting strategy, not a defect in the application, and
weakening the assertion or retrying the navigation would have hidden it rather
than fixed it.

Waiting for the DOM is not a shortcut that risks acting on an unready page:
every interaction afterwards goes through an auto-waiting locator, so the
element-level waits do the real work.

Ported from ``Navigation.cs``. The Java module has no equivalent and calls
``page.navigate(path)`` bare — a known parity gap on the Java side, which
Python does not inherit.
"""

from playwright.sync_api import Page

from framework.support.config import load_config


def to(page: Page, path: str) -> None:
    """Navigates to a path relative to the configured base URL."""
    page.goto(
        path,
        wait_until="domcontentloaded",
        timeout=load_config().timeouts.navigation_ms,
    )
