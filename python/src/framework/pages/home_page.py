"""The catalogue landing page: search, sort, filters, product grid, pagination.

Locators are built once in ``__init__`` and exposed as attributes. No
assertions live here, so this page object is equally usable by a test expecting
results and one expecting none.

Every locator uses ``get_by_test_id``, which resolves against the ``data-test``
attribute ``browser.set_test_id_attribute`` applied once from config. The ids
were read off the shipped C# and Java page objects, which in turn read them from
the live DOM — not guessed.

``__init__`` does not navigate; :meth:`open` does. A test that arrives at this
screen by clicking does not navigate to it again.

This page object mirrors the shipped ones **in full**, including locators and
actions no test yet calls. A page object is the documentation of a screen, so
the next test to need a control reads its test id off here instead of
rediscovering it in the DOM, and a locator costs one line that cannot rot
silently — if the test id changes, the test that uses it fails. The one
deliberate omission is C#'s ``VisibleProductCountAsync``: no test calls it, and
the no-``count()`` rule below forbids reintroducing it.
"""

from playwright.sync_api import Locator, Page

from framework.pages.login_page import LoginPage
from framework.pages.product_detail_page import ProductDetailPage
from framework.support import navigation


class HomePage:
    def __init__(self, page: Page) -> None:
        self._page = page
        self.search_input = page.get_by_test_id("search-query")
        self.search_submit = page.get_by_test_id("search-submit")
        self.search_reset = page.get_by_test_id("search-reset")
        self.sort_select = page.get_by_test_id("sort")
        self.product_names = page.get_by_test_id("product-name")
        self.product_prices = page.get_by_test_id("product-price")
        self.pagination_next = page.get_by_test_id("pagination-next")
        self.pagination_previous = page.get_by_test_id("pagination-prev")
        self.sign_in_link = page.get_by_test_id("nav-sign-in")
        self.eco_friendly_filter = page.get_by_test_id("eco-friendly-filter")

    def open(self) -> "HomePage":
        """Opens the catalogue. The base URL comes from config, so no absolute URL here."""
        navigation.to(self._page, "/")
        return self

    def search(self, query: str) -> "HomePage":
        """Runs a search. Results render in place, so this returns the same page object."""
        self.search_input.fill(query)
        self.search_submit.click()
        return self

    def reset_search(self) -> "HomePage":
        """Clears the current search."""
        self.search_reset.click()
        return self

    def product_card(self, product_id: str) -> Locator:
        """A single product card, addressed by product id."""
        return self._page.get_by_test_id("product-" + product_id)

    def out_of_stock_badge_in(self, product_id: str) -> Locator:
        """The out-of-stock badge inside a given card. Absent when the product is in stock."""
        return self.product_card(product_id).get_by_test_id("out-of-stock")

    def open_product(self, product_id: str) -> ProductDetailPage:
        """Opens a product's detail page by clicking its card."""
        self.product_card(product_id).click()
        return ProductDetailPage(self._page)

    def open_sign_in(self) -> LoginPage:
        """Goes to the sign-in page."""
        self.sign_in_link.click()
        return LoginPage(self._page)

    def go_to_next_page(self) -> "HomePage":
        """Moves to the next page of results."""
        self.pagination_next.click()
        return self

    def sort_by(self, visible_label: str) -> "HomePage":
        """Selects a sort option by its visible label, for example ``Name (A - Z)``."""
        self.sort_select.select_option(label=visible_label)
        return self

    def visible_product_names(self) -> list[str]:
        """Visible product names in display order.

        Uses ``all_inner_texts()``, which resolves the whole set in one call,
        rather than reading ``count()`` and then indexing with ``nth(i)``.

        That is not stylistic. The count-then-index version has a race: the
        count is taken against the grid as it is now, and if the grid re-renders
        mid-loop — which it does after a search or a page change — ``nth(i)``
        waits for an element that no longer exists and the test times out. The
        Java module hit exactly that failure before the same fix.

        A plain loop rather than a comprehension, matching the C# and Java
        bodies line for line.
        """
        texts = self.product_names.all_inner_texts()
        names: list[str] = []
        for text in texts:
            names.append(text.strip())
        return names
