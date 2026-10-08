"""Gets a browser into a signed-in state without touching the login form.

This is the single highest-value flow in a UI suite. Signing in through the
form before every test is usually the largest waste of time in the whole run,
and it makes every test depend on the login screen working. Here the token is
obtained over the API and injected into the browser, so only the tests that are
genuinely *about* logging in ever use the form.

The injection target was verified against the running application: it keeps its
JWT in ``localStorage`` under the key ``auth-token``, storing the raw token
string with no wrapper. ``add_init_script`` installs it before any page script
runs, so the app is already authenticated on first paint and there is no
logged-out flash to race against.
"""

import json

from playwright.sync_api import BrowserContext

from framework.clients.auth_client import AuthClient
from framework.support import test_log


class AuthFlow:
    _TOKEN_STORAGE_KEY = "auth-token"  # noqa: S105 - a localStorage key name, not a token

    def __init__(self, auth_client: AuthClient) -> None:
        self._auth_client = auth_client

    def sign_in_via_api(self, context: BrowserContext, email: str, password: str) -> str:
        """Signs in over the API and seeds the token into the context.

        Returns the token, for tests that also need to call the API as this
        user. Raises ``RuntimeError`` naming the status when the credentials are
        rejected: failing here is far clearer than letting every later assertion
        fail against a logged-out page.
        """
        test_log.info(f"Signing in as {email} via the API and seeding the browser session")

        result = self._auth_client.login_with(email, password)

        if not result.is_successful() or result.body is None:
            raise RuntimeError(
                f"Could not sign in as {email} to set up the test. "
                f"The API returned {result.status}."
            )

        token = result.body.access_token
        self.seed_token(context, token)
        return token

    @staticmethod
    def seed_token(context: BrowserContext, token: str) -> None:
        """Writes the token into ``localStorage`` for every page this context opens.

        An init script rather than navigating and then evaluating, so the value
        is present before the application boots.

        The token is quoted with ``json.dumps`` rather than a hand-rolled
        escaper. A token is opaque and could in principle contain a quote or a
        backslash; concatenating it into script text unescaped is the same class
        of mistake as string-building SQL. ``json.dumps`` produces a valid
        JavaScript string literal for any JSON-safe input, which is simpler and
        safer than C#'s manual ``ToJavaScriptStringLiteral``.
        """
        key = json.dumps(AuthFlow._TOKEN_STORAGE_KEY)
        value = json.dumps(token)
        context.add_init_script(f"window.localStorage.setItem({key}, {value});")

    @staticmethod
    def clear_session(context: BrowserContext) -> None:
        """Clears the seeded session, for a test starting signed out in an existing context."""
        key = json.dumps(AuthFlow._TOKEN_STORAGE_KEY)
        context.clear_cookies()
        context.add_init_script(f"window.localStorage.removeItem({key});")
