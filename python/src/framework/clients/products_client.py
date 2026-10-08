"""Catalogue endpoints.

One method per operation. No assertions, no status checks, no business logic —
those belong to the test. That is what keeps a client usable in a negative test,
where the expected thing is failure.

The ``httpx.Client`` is injected through the constructor rather than read from a
module global. That keeps the dependency visible and lets a test point one
client at a different base address.

Query values go through ``params=``, which ``httpx`` encodes; path segments go
through ``urllib.parse.quote(value, safe="")``. Neither is ever concatenated
raw into a URL.

``create``, ``delete_ignoring_missing`` and ``list_by_brand`` exist in both
shipped clients and are deliberately **not** ported: no test in any module
calls any of them. The Python client surface is exactly what the 34 tests call.
Recorded under "Known gaps" in ``python/README.md``.
"""

from urllib.parse import quote

import httpx

from framework.clients.api_result import ApiResult, result_of
from framework.models.paged_products import PagedProducts
from framework.models.product import Product

_PRODUCTS = "products"


class ProductsClient:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def list_page(self, page: int) -> ApiResult[PagedProducts]:
        """``GET /products?page=n``"""
        response = self._http.get(_PRODUCTS, params={"page": page})
        return result_of(response, PagedProducts)

    def get_by_id(self, product_id: str) -> ApiResult[Product]:
        """``GET /products/{id}``"""
        response = self._http.get(f"{_PRODUCTS}/{quote(product_id, safe='')}")
        return result_of(response, Product)

    def search(self, query: str) -> ApiResult[PagedProducts]:
        """``GET /products/search?q=...``"""
        response = self._http.get(f"{_PRODUCTS}/search", params={"q": query})
        return result_of(response, PagedProducts)
