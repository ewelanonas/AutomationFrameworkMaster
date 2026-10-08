"""Fixtures scoped to the API suite.

The clients and the account flow live in the root ``conftest.py``, because the
contract suite uses them too. This file holds exactly one fixture: the shared
error-body assertion that three API tests need — one catalogue 404 and two auth
rejections, the same three call sites the C# module has.

Why a fixture rather than a helper in a test module: the helper is needed by
``test_product_catalogue.py`` **and** ``test_auth.py``, and cross-importing one
test module from another is banned. C# does exactly that — ``AuthApiTests``
calls ``ProductCatalogueApiTests.AssertNoInternalDetailLeaked`` — which is the
reason the rule exists rather than a reason to copy it. A ``support/`` module is
the other option and is rejected: the thing asserts, and ``support/`` never
asserts.
"""

from collections.abc import Callable

import pytest

# The definition of the rule, not an implementation detail, which is why the list is
# named here rather than left to the caller.
_INTERNAL_DETAIL_MARKERS = (
    "stack trace",
    "stacktrace",
    "sqlstate",
    "exception in",
    "/var/www",
    "laravel",
)


@pytest.fixture
def no_internal_detail_leaked() -> Callable[[str], None]:
    """Asserts an error body exposes no stack trace, SQL state or framework internals."""

    def assert_no_internal_detail_leaked(raw_body: str) -> None:
        lowered = raw_body.lower()
        for marker in _INTERNAL_DETAIL_MARKERS:
            assert marker not in lowered, (
                "an error response must not expose internals, but it contained "
                f"'{marker}'. An error body must not hand an attacker a map of the "
                "implementation."
            )

    return assert_no_internal_detail_leaked
