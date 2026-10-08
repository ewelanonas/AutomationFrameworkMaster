"""Catalogue read behaviour.

Note what these tests deliberately do **not** assert: that the catalogue holds
exactly 50 products. That number is true today and is part of no contract, so
asserting it would produce a red suite the day someone adds a product. The
assertions target invariants instead — page size is respected, ``from``/``to``
agree with the page contents, ``last_page`` follows from ``total``, and no
product appears on two pages. Those hold regardless of how much data exists.
"""

from collections.abc import Callable

import pytest

from framework.clients.products_client import ProductsClient
from framework.support import test_values

_SEARCH_TERM = "Hammer"
_PAGES_TO_CHECK_FOR_DUPLICATES = 4
_PAGE_BEYOND_THE_END = 9999


def _expected_last_page(total: int, per_page: int) -> int:
    """``last_page`` as the envelope's own numbers imply it."""
    if total == 0:
        return 1

    full_pages = total // per_page
    if total % per_page == 0:
        return full_pages
    return full_pages + 1


@pytest.mark.smoke
@pytest.mark.regression
def test_returns_first_page_with_consistent_envelope_when_catalogue_is_listed(
    products_client: ProductsClient,
) -> None:
    """TOOL-1: listing the catalogue returns a self-consistent pagination envelope."""
    result = products_client.list_page(1)

    assert result.status == 200, "listing the catalogue must succeed"
    assert result.body is not None

    page = result.body
    assert page.current_page == 1, "the response echoes the requested page"
    assert page.per_page > 0, "page size is advertised"
    assert page.size() <= page.per_page, (
        "a page never carries more items than the advertised page size"
    )
    assert page.total > 0, "total item count is advertised"
    assert page.from_ == 1, "the first page starts at item 1"
    assert page.to == page.size(), "'to' agrees with the number of items actually returned"
    assert page.last_page == _expected_last_page(page.total, page.per_page), (
        "last_page follows from total and per_page"
    )


@pytest.mark.smoke
@pytest.mark.regression
def test_returns_populated_products_when_catalogue_is_listed(
    products_client: ProductsClient,
) -> None:
    """Listing returns fully populated products rather than empty shells."""
    result = products_client.list_page(1)

    assert result.status == 200
    assert result.body is not None

    first = result.body.data[0]
    assert first.id.strip() != "", "id is present"
    assert first.name.strip() != "", "name is present"
    assert first.price > 0, "price is a positive amount"
    assert first.in_stock is not None, "the stock flag is present"
    assert first.category is not None, "category is expanded, not just an id"
    assert first.brand is not None, "brand is expanded, not just an id"
    assert first.category.name.strip() != "", "category name is present"
    assert first.brand.name.strip() != "", "brand name is present"


@pytest.mark.regression
def test_returns_requested_product_when_id_exists(products_client: ProductsClient) -> None:
    """Fetching a product by id returns the same product the listing showed."""
    listing = products_client.list_page(1)
    assert listing.status == 200
    assert listing.body is not None
    from_list = listing.body.data[0]

    result = products_client.get_by_id(from_list.id)

    assert result.status == 200
    assert result.body is not None
    detail = result.body

    # Compared field by field, excluding specs and category: the detail endpoint expands
    # specifications and the list endpoint omits them, and the detail response adds
    # parent_id to the category. A whole-object comparison would fail on a real
    # difference that is not a defect.
    assert detail.id == from_list.id
    assert detail.name == from_list.name
    assert detail.description == from_list.description
    assert detail.price == from_list.price
    assert detail.in_stock == from_list.in_stock
    assert detail.is_location_offer == from_list.is_location_offer
    assert detail.is_rental == from_list.is_rental
    assert detail.brand == from_list.brand, (
        "the same product must be represented consistently by both endpoints"
    )


@pytest.mark.regression
def test_returns_not_found_when_product_id_does_not_exist(
    products_client: ProductsClient,
    no_internal_detail_leaked: Callable[[str], None],
) -> None:
    """A well-formed id that matches nothing is a 404, not a 400 or a 500."""
    result = products_client.get_by_id(test_values.well_formed_but_missing_id())

    assert result.status == 404, "a well-formed id that matches nothing is a 404"

    error_text = result.error().text()
    assert error_text is not None, "the 404 carries an error body"
    assert error_text.strip() != "", "the error explains what went wrong"
    no_internal_detail_leaked(result.raw_body)


@pytest.mark.regression
def test_does_not_repeat_products_when_paging_through_catalogue(
    products_client: ProductsClient,
) -> None:
    """Pagination must not lose or duplicate rows across pages."""
    first_result = products_client.list_page(1)
    assert first_result.status == 200
    assert first_result.body is not None

    pages_to_check = min(first_result.body.last_page, _PAGES_TO_CHECK_FOR_DUPLICATES)
    seen_ids: list[str] = []

    for page_number in range(1, pages_to_check + 1):
        result = products_client.list_page(page_number)
        assert result.status == 200, f"page {page_number} must load"
        assert result.body is not None

        for product_id in result.body.ids():
            assert product_id not in seen_ids, (
                f"product {product_id} appeared on more than one page, so pagination is "
                "losing or duplicating rows"
            )
            seen_ids.append(product_id)

    assert len(seen_ids) > 0, "the pages checked returned some products"


@pytest.mark.regression
def test_returns_empty_page_when_page_is_beyond_the_last_page(
    products_client: ProductsClient,
) -> None:
    """A page beyond the end is an empty result, not an error."""
    result = products_client.list_page(_PAGE_BEYOND_THE_END)

    assert result.status == 200, "a page beyond the end is an empty result, not an error"
    assert result.body is not None
    assert result.body.is_empty(), "no items are returned"
    assert result.body.from_ is None, "'from' is null on an empty page"
    assert result.body.to is None, "'to' is null on an empty page"


@pytest.mark.regression
@pytest.mark.parametrize("requested_page", [1, 2, 3], ids=["page-1", "page-2", "page-3"])
def test_echoes_requested_page_number_when_page_is_requested(
    products_client: ProductsClient, requested_page: int
) -> None:
    """The response echoes the page number that was requested."""
    result = products_client.list_page(requested_page)

    assert result.status == 200
    assert result.body is not None
    assert result.body.current_page == requested_page


@pytest.mark.regression
def test_returns_only_matching_products_when_searching(
    products_client: ProductsClient,
) -> None:
    """Search returns only products whose name matches the term."""
    result = products_client.search(_SEARCH_TERM)

    assert result.status == 200
    assert result.body is not None
    assert not result.body.is_empty(), "the demo catalogue contains hammers"

    # A loop rather than a predicate over the whole page: the failure message names the
    # offending product instead of reporting that some predicate was false.
    for product in result.body.data:
        assert _SEARCH_TERM.lower() in product.name.lower(), (
            f"search returned '{product.name}', which does not match the term '{_SEARCH_TERM}'"
        )


@pytest.mark.regression
def test_returns_empty_result_when_search_matches_nothing(
    products_client: ProductsClient,
) -> None:
    """A search matching nothing is an empty success, not a 404."""
    term = test_values.unique_name("no-such-product")

    result = products_client.search(term)

    assert result.status == 200, "no matches is an empty success, not a 404"
    assert result.body is not None
    assert result.body.is_empty(), "nothing matched"
    assert result.body.total == 0, "total reflects the empty result"
