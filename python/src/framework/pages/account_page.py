"""The signed-in account overview.

Reaching this page is the observable outcome of a successful login.
"""

from typing import TYPE_CHECKING

from playwright.sync_api import Page

from framework.support import navigation

if TYPE_CHECKING:
    from framework.pages.home_page import HomePage

_PATH = "/account"


class AccountPage:
    def __init__(self, page: Page) -> None:
        self._page = page
        self.page_title = page.get_by_test_id("page-title")
        self.user_menu = page.get_by_test_id("nav-menu")
        self.sign_out_link = page.get_by_test_id("nav-sign-out")
        self.favorites_link = page.get_by_test_id("nav-my-favorites")
        self.profile_link = page.get_by_test_id("nav-my-profile")
        self.invoices_link = page.get_by_test_id("nav-my-invoices")

    def open(self) -> "AccountPage":
        navigation.to(self._page, _PATH)
        return self

    def open_user_menu(self) -> "AccountPage":
        """Opens the user dropdown, which holds sign-out and the account links."""
        self.user_menu.click()
        return self

    def sign_out(self) -> "HomePage":
        """Signs out and returns the catalogue the application lands on."""
        # The four page objects form a navigation cycle — home -> login -> account ->
        # home — which C# and Java resolve at compile time and Python cannot resolve at
        # import time. The cycle is broken here, at exactly one edge, with a local import
        # in the one method that needs the class at runtime. The annotation above comes
        # from the TYPE_CHECKING block, so mypy still sees the real type.
        from framework.pages.home_page import HomePage

        self.open_user_menu()
        self.sign_out_link.click()
        return HomePage(self._page)
