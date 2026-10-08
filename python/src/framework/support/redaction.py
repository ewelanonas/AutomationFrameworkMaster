"""The single place every log line and report attachment passes through.

This exists because a trace, an Allure attachment and a CI log all outlive the
run and are readable by more people than the test author expects. A token that
reaches any of them cannot be un-leaked.

Three properties are non-negotiable:

1. Redaction replaces with the fixed marker :data:`MARKER`.
2. It never partially reveals a value.
3. It never reports a secret's length.

A straight port of ``Redaction.cs`` / ``Redaction.java``: the same marker, the
same five header names, the same nineteen field names, the same four patterns
and the same two-pass :func:`body`.

**Name matching is equality after lowercasing**, not substring. The C#
original compares with ``StringComparison.OrdinalIgnoreCase`` for both lists,
so ``access_token`` is redacted because it is a listed name, and
``password_hint`` is not because it is not. Substring matching is the console
allowlist's rule (``console_error_policy``) and only its rule; using it here
would quietly redact more than the other two modules do, which is drift in the
one place where three modules are supposed to produce identical output.

``email`` and ``phone`` are deliberately **not** in :data:`_SENSITIVE_FIELDS`,
which narrows a bullet in ``.kiro/steering/test-data-and-secrets.md``. Neither
shipped module redacts them, and adding them here would break cross-module
parity on redaction output and replace the single most useful diagnostic in the
suite — the generated ``af-{runId}-{processTag}-{n}@example.invalid`` address
that makes an identity collision readable from a log — with the marker. Every
address this module generates is on a reserved domain and the one phone number
is a reserved run of zeros, so no real PII exists here at all. This is a
documented rule being knowingly narrowed across three modules, so it warrants
an ADR: ``docs/decisions/0007-redaction-field-list-excludes-email-and-phone.md``,
owned by the orchestrator rather than by this module.
"""

import re

MARKER = "***REDACTED***"

# Header names redacted regardless of value.
_SENSITIVE_HEADERS = (
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "x-api-key",
)

# JSON field names redacted regardless of value.
_SENSITIVE_FIELDS = (
    "password",
    "passwd",
    "current_password",
    "new_password",
    "password_confirmation",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "secret",
    "client_secret",
    "api_key",
    "apikey",
    "authorization",
    "ssn",
    "card",
    "card_number",
    "cvv",
    "pin",
)

# '"field": "value"' or '"field": 123' in a JSON body.
_JSON_FIELD = re.compile(r'("(?P<key>[A-Za-z0-9_\-]+)"\s*:\s*)("[^"]*"|[^,}\s]+)')

# A JWT anywhere in free text, including inside a URL query string.
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}")

# 'Bearer <token>' in free text.
_BEARER = re.compile(r"(bearer\s+)([A-Za-z0-9._\-]{8,})", re.IGNORECASE)

# A run of 13 to 19 digits, the shape of a payment card number.
_CARD_LIKE = re.compile(r"\b\d{13,19}\b")


def is_sensitive_header(header_name: str | None) -> bool:
    """True when a header of this name must never have its value written out."""
    if header_name is None or header_name.strip() == "":
        return False

    return header_name.strip().lower() in _SENSITIVE_HEADERS


def header(header_name: str, value: str | None) -> str | None:
    """Redacts a header value, returning the marker when the name is sensitive."""
    if is_sensitive_header(header_name):
        return MARKER

    return text(value)


def body(content: str | None) -> str | None:
    """Redacts a body or free-text blob.

    Two passes, both of which run: sensitive JSON fields by name, then token
    shapes by pattern. A token can arrive either as a named field or embedded
    in a URL.
    """
    if content is None or content == "":
        return content

    return text(_redact_json_fields(content))


def text(content: str | None) -> str | None:
    """Redacts token-shaped and card-shaped substrings in any text."""
    if content is None or content == "":
        return content

    result = _JWT.sub(MARKER, content)
    result = _BEARER.sub(r"\1" + MARKER, result)
    return _CARD_LIKE.sub(MARKER, result)


def _redact_json_fields(content: str) -> str:
    return _JSON_FIELD.sub(_replace_sensitive_field_value, content)


def _replace_sensitive_field_value(match: re.Match[str]) -> str:
    """Replaces one matched JSON field's value with the marker when its name is sensitive.

    The capture group holding ``"field":`` is kept verbatim so only the value is
    replaced. Replacing the whole match would drop the key and change the shape
    of the logged body.
    """
    key = match.group("key")
    if _is_sensitive_field(key):
        return match.group(1) + '"' + MARKER + '"'

    return match.group(0)


def _is_sensitive_field(field_name: str) -> bool:
    return field_name.strip().lower() in _SENSITIVE_FIELDS
