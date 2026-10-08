"""The redaction choke point, checked against the four shapes it must catch.

Each case also asserts the two properties that make redaction trustworthy: the
marker never carries a length and never carries a prefix of the secret.
"""

import pytest

from framework.support import redaction

# Structurally valid JWT shapes assembled for these assertions. Not credentials to any
# system — they decode to nothing and authenticate nothing.
_JWT_LIKE = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.ZmFrZXNpZ25hdHVyZQ"


@pytest.mark.smoke
def test_replaces_the_value_with_the_marker_when_a_jwt_appears_in_text() -> None:
    """A JWT anywhere in free text becomes the marker, with no fragment surviving."""
    redacted = redaction.text(f"token in a url: ?access_token={_JWT_LIKE}&page=1")

    assert redacted is not None
    assert redaction.MARKER in redacted
    assert "eyJhbGciOiJIUzI1NiJ9" not in redacted, "no fragment of the token may survive"
    assert str(len(_JWT_LIKE)) not in redacted, "the marker must not reveal a length"
    assert "page=1" in redacted, "surrounding text is left intact"


@pytest.mark.smoke
def test_replaces_the_value_with_the_marker_when_a_bearer_header_is_logged() -> None:
    """A sensitive header is redacted by name, and an ordinary one is not."""
    assert redaction.header("Authorization", "Bearer abc123def456") == redaction.MARKER
    # Case-insensitive by name, mirroring the C# OrdinalIgnoreCase comparison.
    assert redaction.header("AUTHORIZATION", "Bearer abc123def456") == redaction.MARKER
    assert redaction.header("Content-Type", "application/json") == "application/json", (
        "an ordinary header value survives untouched"
    )


@pytest.mark.smoke
def test_replaces_the_value_with_the_marker_when_a_password_field_is_in_a_body() -> None:
    """A sensitive JSON field is redacted by name; a lookalike name is not.

    Name matching is equality after lowercasing, not substring, which is why
    ``password_hint`` survives: it is not a listed name. Substring matching is
    the console allowlist's rule and only its rule.
    """
    body = redaction.body(
        '{"email":"af-1-2-3@example.invalid","Password":"hunter2",'
        '"password_hint":"my cat","note":"keep me"}'
    )

    assert body is not None
    assert "hunter2" not in body, "the password value must not survive"
    assert f'"Password":"{redaction.MARKER}"' in body, "the key is kept, only the value goes"
    assert "my cat" in body, "password_hint is not a listed field name"
    assert "keep me" in body, "a non-sensitive field survives"
    assert "af-1-2-3@example.invalid" in body, (
        "the generated address stays readable: it is the diagnostic that makes an "
        "identity collision traceable, and it is not real PII"
    )


@pytest.mark.smoke
def test_replaces_the_value_with_the_marker_when_a_card_shaped_run_of_digits_appears() -> None:
    """A 13-to-19 digit run is redacted; a shorter run is left alone."""
    redacted = redaction.text("order 4111111111111111 total 42")

    assert redacted is not None
    assert redaction.MARKER in redacted
    assert "4111" not in redacted, "no partial reveal, not even the leading digits"
    assert "16" not in redacted, "the marker must not reveal a length"
    assert "total 42" in redacted, "a short run of digits is not card-shaped"
