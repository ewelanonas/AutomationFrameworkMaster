"""Sign-in through the form.

This is the one place the login form is used. Every other UI test seeds its
session over the API via ``AuthFlow``, because signing in through the form
before every test is usually the largest single waste of time in a suite, and it
makes every unrelated test depend on the login screen working.

Each test registers its own disposable account. The negative tests deliberately
fail a login, which moves an account towards a server-side lockout — and doing
that to a shared account locked it out from under two language modules once
already.

The error message asserted here was read from the running application. Note
that the UI says "Invalid email or password" while the API says "Unauthorized"
for the same rejection: different layers, different wording, and a test that
assumed they matched would fail for no useful reason. That is why the two are
asserted separately, here and in ``test_auth.py``.
"""

import re

import pytest
from playwright.sync_api import BrowserContext, Page, expect

from framework.flows.auth_flow import AuthFlow
from framework.models.test_account import TestAccount
from framework.pages.account_page import AccountPage
from framework.pages.login_page import LoginPage
from framework.support import test_values

_REJECTION_MESSAGE = "Invalid email or password"
_WRONG_PASSWORD = "definitely-not-the-password"  # noqa: S105 - a deliberately invalid value


@pytest.mark.smoke
@pytest.mark.regression
def test_reaches_account_page_when_credentials_are_valid(
    page: Page, disposable_account: TestAccount
) -> None:
    """Valid credentials reach the account page."""
    login = LoginPage(page)
    login.open()

    login.sign_in(disposable_account.email, disposable_account.password)

    account_page = login.account_page()
    expect(page).to_have_url(re.compile(r".*/account.*"))
    expect(account_page.page_title).to_be_visible()
    expect(account_page.user_menu).to_be_visible()


@pytest.mark.smoke
@pytest.mark.regression
def test_shows_error_when_password_is_wrong(page: Page, disposable_account: TestAccount) -> None:
    """A wrong password shows an error and leaves the user on the form."""
    login = LoginPage(page)
    login.open()

    login.sign_in(disposable_account.email, _WRONG_PASSWORD)

    expect(login.error_message).to_be_visible()
    expect(login.error_message).to_have_text(_REJECTION_MESSAGE)

    # Staying on the form matters as much as the message: a failed login that navigated
    # away would leave the user with no way to correct the mistake.
    expect(login.form).to_be_visible()
    expect(page).to_have_url(re.compile(r".*/auth/login.*"))


@pytest.mark.regression
def test_does_not_reveal_whether_account_exists_when_email_is_unknown(page: Page) -> None:
    """An unknown email produces the same message as a wrong password.

    The same wording, deliberately. A distinct message here would let anyone
    enumerate which email addresses hold accounts.
    """
    login = LoginPage(page)
    login.open()

    login.sign_in(test_values.unique_email(), "any-password")

    expect(login.error_message).to_have_text(_REJECTION_MESSAGE)


@pytest.mark.regression
def test_skips_login_form_when_session_is_seeded_via_api(
    page: Page,
    browser_context: BrowserContext,
    auth_flow: AuthFlow,
    disposable_account: TestAccount,
) -> None:
    """A session seeded over the API skips the login form entirely.

    This is the pattern every other UI test in the suite uses, and it is worth
    one test of its own so a regression in the seeding mechanism is reported
    here rather than as a confusing cascade of unrelated failures.
    """
    auth_flow.sign_in_via_api(
        browser_context, disposable_account.email, disposable_account.password
    )

    account_page = AccountPage(page)
    account_page.open()

    # No form was touched.
    expect(account_page.page_title).to_be_visible()
    expect(account_page.user_menu).to_be_visible()
