"""Catalogue shapes: product, category, brand, image and specification row.

Every model sets ``extra="ignore"``. **Strictness about unknown fields lives in
``shared/contracts/``, not in the model layer.** The contract suite validates
raw response text against the JSON Schemas, which already set
``additionalProperties: false`` at the root and in every nested object, and
neither shipped module rejects unknown members: ``ApiHttp.cs`` leaves
System.Text.Json's default skip-unknown behaviour in place, and every Java
model carries ``@JsonIgnoreProperties(ignoreUnknown = true)``. A Python-only
``forbid`` would mean the day the demo target adds a field, eleven Python API
tests go red while Java and C# stay green — the exact cross-module asymmetry
parity exists to prevent.

No model sets ``strict=True``: Pydantic's default lax mode already coerces
``"12.50"`` to a ``Decimal``, which is the equivalent of C#'s
``NumberHandling = AllowReadingFromString``. Strict mode would make Python the
only module that rejects a payload the other two accept.

``populate_by_name=True`` throughout, so a model can be built in Python by
field name and parsed from the wire by alias. ``frozen=True`` because nothing
ever mutates a parsed response, and an immutable model cannot be edited by one
test in a way another test sees.
"""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict

_MODEL_CONFIG = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)


class Category(BaseModel):
    """A product category.

    ``parent_id`` appears only on ``GET /products/{id}``, where categories are
    expanded with their parent, and is null for a top-level category. The list
    endpoint omits it entirely.

    ``slug`` is optional, which is **observed behaviour and not a weakening**:
    ``GET /products/search`` expands the category as ``{id, name}`` only, while
    the list and detail endpoints include the slug. C# declares it as a
    non-nullable ``string`` and System.Text.Json quietly leaves it null when
    absent, so the two modules accept the same payloads; Python just has to say
    so out loud. The strictness that matters still lives in
    ``shared/contracts/toolshop-product.schema.json``, which **requires**
    ``category.slug`` for the two endpoints the contract suite validates.
    """

    model_config = _MODEL_CONFIG

    id: str
    name: str
    slug: str | None = None
    parent_id: str | None = None


class Brand(BaseModel):
    """A product brand."""

    model_config = _MODEL_CONFIG

    id: str
    name: str
    slug: str | None = None


class ProductImage(BaseModel):
    """Image metadata attached to a product, including its attribution."""

    model_config = _MODEL_CONFIG

    id: str
    file_name: str
    title: str | None = None
    by_name: str | None = None
    by_url: str | None = None
    source_name: str | None = None
    source_url: str | None = None


class ProductSpec(BaseModel):
    """One specification row on a product, for example ``Weight = 340 g``.

    Returned only by ``GET /products/{id}``; the list endpoint omits the whole
    array.

    ``spec_value`` is ``str | float | None`` because the API genuinely sends
    either a string (``"Bi-component"``) or a number (``200``) depending on the
    row. C# models it as a ``JsonElement`` and needs a ``ValueAsText()`` helper
    to read it; the Pydantic union is already readable, so no helper is ported.
    Nothing asserts on it numerically.
    """

    model_config = _MODEL_CONFIG

    id: str
    product_id: str
    spec_name: str
    spec_value: str | float | None = None
    spec_unit: str | None = None


class Product(BaseModel):
    """A product in the catalogue.

    ``price`` is a ``Decimal``, not a ``float``. Money in binary floating point
    produces assertions that fail by a cent for no visible reason, and there is
    no upside to it here.

    ``specs`` is populated only by ``GET /products/{id}``; the list endpoint
    omits it.
    """

    model_config = _MODEL_CONFIG

    id: str
    name: str
    description: str | None = None
    price: Decimal
    in_stock: bool | None = None
    is_location_offer: bool | None = None
    is_rental: bool | None = None
    is_eco_friendly: bool | None = None
    co2_rating: str | None = None
    category: Category | None = None
    brand: Brand | None = None
    product_image: ProductImage | None = None
    specs: list[ProductSpec] | None = None
