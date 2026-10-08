"""The sign-in page.

:meth:`LoginPage.submit` does not assert success and does not return the
account page, because a failed login stays on this page. Deciding what happened
is the test's job — that is what keeps this object usable for both the happy
path and the invalid-credentials case.
"""

from playwright.sync_api import Page

from framework.pages.account_page import AccountPage
from framework.support import navigation

_PATH = "/auth/login"


class LoginPage:
    def __init__(self, page: Page) -> None:
        self._page = page
        self.form = page.get_by_test_id("login-form")
        self.email_input = page.get_by_test_id("email")
        self.password_input = page.get_by_test_id("password")
        self.submit_button = page.get_by_test_id("login-submit")
        self.error_message = page.get_by_test_id("login-error")
        self.register_link = page.get_by_test_id("register-link")
        self.forgot_password_link = page.get_by_test_id("forgot-password-link")

    def open(self) -> "LoginPage":
        navigation.to(self._page, _PATH)
        return self

    def enter_email(self, email: str) -> "LoginPage":
        self.email_input.fill(email)
        return self

    def enter_password(self, password: str) -> "LoginPage":
        self.password_input.fill(password)
        return self

    def submit(self) -> "LoginPage":
        self.submit_button.click()
        return self

    def sign_in(self, email: str, password: str) -> "LoginPage":
        """Fills both fields and submits. Whether it succeeded is for the test to assert."""
        self.enter_email(email)
        self.enter_password(password)
        return self.submit()

    def account_page(self) -> AccountPage:
        """The account page object. Call only after asserting the sign-in succeeded."""
        return AccountPage(self._page)
