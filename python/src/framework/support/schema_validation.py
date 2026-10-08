"""Validates real responses against the JSON Schemas in ``shared/contracts/``.

The schemas set ``additionalProperties: false``, so this catches a field the
service quietly added or renamed — the change that otherwise goes unnoticed
until something downstream breaks.

The schemas carry no ``$schema`` and no ``$id`` on purpose: the draft version is
declared by the validator in each module, so every language module validates
against the same dialect. Resources are therefore built with
``default_specification=DRAFT202012`` and validated with
``Draft202012Validator``.

**Cross-file ``$ref`` resolution.** Every ``*.schema.json`` is loaded once into
a ``referencing.Registry`` keyed by its **bare file name**. The cross-file
``$ref`` in ``toolshop-paged-products.schema.json`` is the relative string
``"toolshop-product.schema.json"``, and the schemas declare no ``$id``, so the
referring resource's base URI is empty and ``urljoin`` leaves the ref exactly
as written — which is the registry key. Sibling refs therefore resolve from
memory with no network fetch and no file URIs to get wrong across Windows and
Linux.

Violations are formatted ``"{location}: {message}"`` where ``location`` is a
**JSON Pointer built from** ``error.absolute_path``. ``error.json_path`` exists
and is tempting, but it yields JSONPath (``$.data[0].id``, never empty), so the
three modules would report the same drift in two different notations and nobody
could diff them. The pointer form matches C#'s ``InstanceLocation`` with the
same ``(root)`` fallback.

``format`` assertion stays **off**, matching C#'s
``RequireFormatValidation = false``.
"""

import functools
import json

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Resource
from referencing.jsonschema import DRAFT202012, Schema, SchemaRegistry

from framework.support import redaction, repo_paths

_PREVIEW_CHARACTERS = 300


def validate(schema_file_name: str, json_text: str | None) -> list[str]:
    """Returns the violations. An empty list means the payload conforms."""
    registry = _registry()
    schema = _schema_for(schema_file_name, registry)

    if json_text is None or json_text.strip() == "":
        raise RuntimeError("Response body is empty, so it cannot be validated against a schema.")

    # Parsed first, before any validator work, so an unparseable body fails with a
    # readable message rather than with a validator internal.
    try:
        instance = json.loads(json_text)
    except json.JSONDecodeError as parse_error:
        raise RuntimeError(
            "Response body is not valid JSON, so it cannot be validated against a schema. "
            f"Body starts: {redaction.body(_preview(json_text))}"
        ) from parse_error

    validator = Draft202012Validator(schema, registry=registry)

    # Sorted so two runs against the same drift report the violations in the same order.
    # A single-expression key function is the one lambda the readability rules allow.
    errors = sorted(validator.iter_errors(instance), key=lambda error: list(error.absolute_path))

    violations: list[str] = []
    for error in errors:
        violations.append(f"{_location_of(error)}: {error.message}")

    return violations


def _location_of(error: ValidationError) -> str:
    parts: list[str] = []
    for part in error.absolute_path:
        parts.append(str(part))

    if len(parts) == 0:
        return "(root)"

    return "/" + "/".join(parts)


def _schema_for(schema_file_name: str, registry: SchemaRegistry) -> Schema:
    try:
        resolved = registry[schema_file_name]
    except KeyError as error:
        available = ", ".join(sorted(_schema_names()))
        raise RuntimeError(
            f"No schema named '{schema_file_name}' in {repo_paths.contracts()}. "
            f"Available: {available}. Contracts live in shared/contracts/ and are committed."
        ) from error

    return resolved.contents


@functools.cache
def _schema_names() -> tuple[str, ...]:
    names: list[str] = []
    for path in sorted(repo_paths.contracts().glob("*.schema.json")):
        names.append(path.name)
    return tuple(names)


@functools.cache
def _registry() -> SchemaRegistry:
    """Loads every contract file exactly once, keyed by bare file name.

    An empty contracts directory is its own error, mirroring
    ``LoadContractsOnce``: without it, a missing checkout would surface much
    later as "unknown schema name" and send the reader looking for a typo.
    """
    contracts_directory = repo_paths.contracts()

    resources: list[tuple[str, Resource[Schema]]] = []
    for path in sorted(contracts_directory.glob("*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        resources.append(
            (path.name, Resource.from_contents(contents, default_specification=DRAFT202012))
        )

    if len(resources) == 0:
        raise RuntimeError(f"No *.schema.json files found in {contracts_directory}.")

    empty: SchemaRegistry = SchemaRegistry()
    return empty.with_resources(resources)


def _preview(json_text: str) -> str:
    if len(json_text) <= _PREVIEW_CHARACTERS:
        return json_text
    return json_text[:_PREVIEW_CHARACTERS] + "..."
