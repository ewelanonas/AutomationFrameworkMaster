"""Browsing the catalogue in a real browser.

Only behaviour that genuinely needs a browser lives here. The search *rules*
are covered far more cheaply and thoroughly in ``test_product_catalogue.py``;
what this file checks is that the page renders what the API returned, and that
navigation works.

Expectations always come from the API, never from reading the page first. A UI
test that derives its expectation from the same page it is checking proves only
that the page agrees with itself.

Page objects are constructed in the test body, from the ``page`` fixture, which
is what both shipped modules do. There are deliberately no page-object
fixtures: a ``home_page`` fixture would hide which screen a test starts on and
quietly couple the starting state to a fixture's body.
"""

from decimal import Decimal

import pytest
from playwright.sync_api import Page, expect

from framework.clients.products_client import ProductsClient
from framework.models.product import Product
from framework.pages.home_page import HomePage
from framework.pages.product_detail_page import ProductDetailPage
from framework.support import console_error_policy

_SEARCH_TERM = "Hammer"
_TWO_DECIMAL_PLACES = Decimal("0.01")


def first_product_from_api(products_client: ProductsClient) -> Product:
    """Fetches a product over the API to use as the expectation.

    Raises rather than indexing blindly when page 1 comes back empty: an
    unreachable or empty catalogue is a setup failure, and saying so beats an
    ``IndexError`` three frames away from the cause.
    """
    result = products_client.list_page(1)

    if result.status != 200 or result.body is None or result.body.is_empty():
        raise RuntimeError(
            "The catalogue API must return a populated first page to set up this test, "
            f"but answered {result.status}. Body: {result.raw_body}"
        )

    return result.body.data[0]


def _rendered_price_of(product: Product) -> str:
    """The price as the detail page renders it: always two decimal places.

    ``str()`` on a ``Decimal`` is culture-invariant, which is the half of this
    that is certain. The other half was probed rather than assumed: Pydantic's
    JSON-mode ``Decimal`` does **not** preserve the literal's trailing zero —
    ``{"price": 14.10}`` parses to ``Decimal('14.1')`` — so a bare ``str()``
    would render ``14.1`` against a page showing ``14.10`` and fail for a
    formatting reason, not a functional one. Quantizing states the application's
    rule instead: this is money, and the detail page renders money to the cent.

    Reading the price off the page would be the other way to make it pass, and
    it is forbidden: the expectation has to come from the API.
    """
    return str(product.price.quantize(_TWO_DECIMAL_PLACES))


@pytest.mark.smoke
@pytest.mark.regression
def test_shows_only_matching_products_when_searching_by_name(page: Page) -> None:
    """TOOL-2: searching by name shows only matching products."""
    home = HomePage(page)
    home.open()

    home.search(_SEARCH_TERM)

    # Two web-first assertions, in this order, and the second one matters.
    #
    # to_be_visible() alone passes immediately, because the pre-search grid is already on
    # screen. Reading the names straight after it enumerates a grid that is still
    # mid-re-render, which is a race. to_contain_text retries until the first card is
    # actually a search result, which is the observable signal that the re-render
    # finished. No sleep, and nothing to tune.
    expect(home.product_names.first).to_be_visible()
    expect(home.product_names.first).to_contain_text(_SEARCH_TERM)

    shown = home.visible_product_names()
    assert len(shown) > 0, "the search returned something to check"

    for name in shown:
        assert _SEARCH_TERM.lower() in name.lower(), (
            f"the grid shows '{name}', which does not match the search term '{_SEARCH_TERM}'"
        )


@pytest.mark.smoke
@pytest.mark.regression
def test_opens_detail_page_matching_the_card(page: Page, products_client: ProductsClient) -> None:
    """The detail page shows the same name and price the catalogue advertised."""
    expected = first_product_from_api(products_client)

    home = HomePage(page)
    home.open()
    detail = home.open_product(expected.id)

    # The card renders the price with a currency symbol, the detail page without one.
    # Both were read from the live pages; asserting the detail page's format here is
    # deliberate, not an oversight.
    expect(detail.product_name).to_have_text(expected.name)
    expect(detail.unit_price).to_have_text(_rendered_price_of(expected))


@pytest.mark.regression
def test_renders_specifications_when_product_is_opened(
    page: Page, products_client: ProductsClient
) -> None:
    """A product detail page lists its specifications."""
    expected = first_product_from_api(products_client)

    detail = ProductDetailPage(page)
    detail.open(expected.id)

    expect(detail.specifications_table).to_be_visible()

    specification_names = detail.specification_names()
    assert len(specification_names) > 0, "a product detail page lists its specifications"


@pytest.mark.regression
def test_moves_to_second_page_without_repeating_products(page: Page) -> None:
    """The second page of results does not repeat products from the first."""
    home = HomePage(page)
    home.open()

    expect(home.product_names.first).to_be_visible()
    first_page_names = home.visible_product_names()

    home.go_to_next_page()

    # Waiting on the observable change rather than on time: the first name differs once
    # the new page has rendered. Playwright retries the assertion until it does.
    expect(home.product_names.first).not_to_have_text(first_page_names[0])

    second_page_names = home.visible_product_names()

    for name in second_page_names:
        assert name not in first_page_names, (
            f"'{name}' appeared on both pages, so the second page repeats the first"
        )


@pytest.mark.regression
def test_loads_catalogue_without_unexpected_console_errors(
    page: Page, console_errors: list[str]
) -> None:
    """The catalogue loads without logging an unexpected browser console error.

    A page that renders correctly while throwing in the console is a real defect
    that functional assertions never notice. Its own test, so a console
    regression is not attributed to an unrelated failure.
    """
    home = HomePage(page)
    home.open()
    expect(home.product_names.first).to_be_visible()

    # Filtered through the reviewed allowlist rather than asserted empty. The live
    # application fires an authenticated request on the anonymous catalogue page and logs
    # the resulting 401 on every load; a blanket empty assertion would be red on every
    # run and would get deleted within a week.
    unexpected = console_error_policy.significant(console_errors)

    assert unexpected == [], (
        "the catalogue page logged a console error that is not on the reviewed allowlist "
        "in console_error_policy. Either the page has a new defect, or the allowlist "
        f"needs a new entry with a documented reason. Unexpected: {unexpected}"
    )
