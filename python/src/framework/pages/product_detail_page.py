"""A single product's detail page.

Worth noting for anyone writing assertions: the price here renders **without** a
currency symbol (``14.15``), while the catalogue card renders **with** one
(``$14.15``). Two different elements, two different formats. Both were read from
the live pages.
"""

from playwright.sync_api import Locator, Page

from framework.support import navigation

_PATH_PREFIX = "/product/"


class ProductDetailPage:
    def __init__(self, page: Page) -> None:
        self._page = page
        self.product_name = page.get_by_test_id("product-name")
        self.unit_price = page.get_by_test_id("unit-price")
        self.description = page.get_by_test_id("product-description")
        self.co2_rating_badge = page.get_by_test_id("co2-rating-badge")
        self.quantity_input = page.get_by_test_id("quantity")
        self.increase_quantity = page.get_by_test_id("increase-quantity")
        self.decrease_quantity = page.get_by_test_id("decrease-quantity")
        self.add_to_cart_button = page.get_by_test_id("add-to-cart")
        self.add_to_favorites_button = page.get_by_test_id("add-to-favorites")
        self.specifications_table = page.get_by_test_id("product-specs")

    def open(self, product_id: str) -> "ProductDetailPage":
        """Opens a product directly by id, skipping the catalogue."""
        navigation.to(self._page, _PATH_PREFIX + product_id)
        return self

    def set_quantity(self, quantity: int) -> "ProductDetailPage":
        self.quantity_input.fill(str(quantity))
        return self

    def increase_quantity_by(self, times: int) -> "ProductDetailPage":
        for _ in range(times):
            self.increase_quantity.click()
        return self

    def add_to_cart(self) -> "ProductDetailPage":
        self.add_to_cart_button.click()
        return self

    def specification_value(self, specification_name: str) -> Locator:
        """The specification value cell for a named row, for example ``Weight``.

        CSS scoped inside a test-id container, which is the only place this
        module uses CSS at all: the spec rows carry no individual test id.
        """
        return (
            self.specifications_table.locator("[data-test='spec-row']")
            .filter(has_text=specification_name)
            .locator("[data-test='spec-value']")
        )

    def specification_names(self) -> list[str]:
        """All specification row names, in display order.

        Resolved in one call, for the same reason as
        ``HomePage.visible_product_names``: indexing after a separate count is a
        race whenever the table can re-render.
        """
        cells = self.specifications_table.locator("[data-test='spec-name']")
        texts = cells.all_inner_texts()
        names: list[str] = []
        for text in texts:
            names.append(text.strip())
        return names
