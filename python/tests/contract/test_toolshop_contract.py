"""Contract verification against the schemas in ``shared/contracts/``.

These are the tests that catch drift. The schemas set
``additionalProperties: false``, so a field the service quietly adds, removes or
renames fails here — which is the entire point. A failure in this file is not
necessarily a defect: it is a change nobody told the test suite about, and the
correct response is to find out which, then update the schema deliberately
rather than loosening it to make the test pass.

The same schemas are validated by the C# and Java modules with different
validators. Agreeing on the schema rather than on a library is what makes the
contract shared rather than duplicated.

No new schema file is needed: the four existing schemas cover everything this
inventory validates.
"""

import pytest

from framework.clients.auth_client import AuthClient
from framework.clients.products_client import ProductsClient
from framework.models.test_account import TestAccount
from framework.support import test_values
from framework.support.schema_validation import validate

_DECIDE_WHICH = (
    "Either the API changed or the schema is stale — decide which, then update the "
    "schema deliberately rather than loosening it to make this pass."
)


@pytest.mark.contract
def test_product_list_matches_schema(products_client: ProductsClient) -> None:
    """The product list response matches toolshop-paged-products.schema.json exactly."""
    result = products_client.list_page(1)
    assert result.status == 200

    violations = validate("toolshop-paged-products.schema.json", result.raw_body)

    assert violations == [], (
        "the product list no longer matches "
        f"shared/contracts/toolshop-paged-products.schema.json. {_DECIDE_WHICH} "
        f"Violations: {violations}"
    )


@pytest.mark.contract
def test_single_product_matches_schema(products_client: ProductsClient) -> None:
    """A single product response matches toolshop-product.schema.json exactly."""
    listing = products_client.list_page(1)
    assert listing.status == 200
    assert listing.body is not None

    result = products_client.get_by_id(listing.body.data[0].id)
    assert result.status == 200

    violations = validate("toolshop-product.schema.json", result.raw_body)

    assert violations == [], (
        "the product representation drifted from "
        f"shared/contracts/toolshop-product.schema.json. {_DECIDE_WHICH} "
        f"Violations: {violations}"
    )


@pytest.mark.contract
def test_every_product_on_page_matches_schema(products_client: ProductsClient) -> None:
    """Every product on page 1 matches the product schema, not just the first.

    Checking only the first item is the usual shortcut, and it misses the case
    where one product has a null field the others populate.
    """
    result = products_client.list_page(1)
    assert result.status == 200
    assert result.body is not None

    for product in result.body.data:
        single = products_client.get_by_id(product.id)

        violations = validate("toolshop-product.schema.json", single.raw_body)

        assert violations == [], (
            f"product {product.id} ('{product.name}') does not match the product schema. "
            f"{_DECIDE_WHICH} Violations: {violations}"
        )


@pytest.mark.contract
def test_login_response_matches_schema(
    auth_client: AuthClient, disposable_account: TestAccount
) -> None:
    """The login response matches toolshop-login-response.schema.json exactly."""
    result = auth_client.login_with(disposable_account.email, disposable_account.password)
    assert result.status == 200

    violations = validate("toolshop-login-response.schema.json", result.raw_body)

    assert violations == [], (
        "the login response drifted from "
        f"shared/contracts/toolshop-login-response.schema.json. {_DECIDE_WHICH} "
        f"Violations: {violations}"
    )


@pytest.mark.contract
def test_not_found_error_matches_schema(products_client: ProductsClient) -> None:
    """A 404 error body matches toolshop-error.schema.json."""
    result = products_client.get_by_id(test_values.well_formed_but_missing_id())
    assert result.status == 404

    violations = validate("toolshop-error.schema.json", result.raw_body)

    assert violations == [], (
        "the 404 body does not match the error schema. The schema requires exactly one "
        "of 'message' or 'error' — the demo API uses different fields on different "
        f"endpoints, which is recorded in shared/contracts/README.md. {_DECIDE_WHICH} "
        f"Violations: {violations}"
    )


@pytest.mark.contract
def test_unauthorized_error_matches_schema(auth_client: AuthClient) -> None:
    """A 401 error body matches toolshop-error.schema.json."""
    result = auth_client.current_user(None)
    assert result.status == 401

    violations = validate("toolshop-error.schema.json", result.raw_body)

    assert violations == [], (
        f"the 401 body does not match the error schema. {_DECIDE_WHICH} Violations: {violations}"
    )
