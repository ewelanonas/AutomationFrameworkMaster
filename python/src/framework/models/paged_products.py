"""The pagination envelope the catalogue returns."""

from pydantic import BaseModel, ConfigDict, Field

from framework.models.product import Product


class PagedProducts(BaseModel):
    """One page of the catalogue.

    ``from_`` and ``to`` are nullable: on an empty result the API sends null for
    both, which is exactly the case a pagination test needs to cover.

    ``from`` is a Python keyword, so the field is ``from_`` with
    ``Field(alias="from")``. This is the one place in the module a trailing
    underscore appears.
    """

    model_config = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)

    current_page: int
    data: list[Product]
    from_: int | None = Field(default=None, alias="from")
    to: int | None = None
    last_page: int
    per_page: int
    total: int

    def is_empty(self) -> bool:
        """True when this page carries no items."""
        return len(self.data) == 0

    def size(self) -> int:
        """Number of items on this page, 0 when the page is empty."""
        return len(self.data)

    def ids(self) -> list[str]:
        """The ids on this page, in order.

        A plain loop rather than a comprehension, mirroring the C# and Java
        bodies: this is read by people whose main language may not be Python.
        """
        result: list[str] = []
        for product in self.data:
            result.append(product.id)
        return result
