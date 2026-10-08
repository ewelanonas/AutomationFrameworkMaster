"""Authentication behaviour, including the boundary cases that matter most.

Every test here registers its own ``disposable_account``. That is not ceremony:
sending a wrong password increments a server-side failed-attempt counter, and
on a shared account that counter eventually trips a lockout. When it did, the
API answered ``423 Locked`` to every login and took two language modules down
at once. A shared account is shared mutable state; tests own their data, and
this is what that rule is protecting against.

The statuses asserted here were observed against the running service, not
assumed. One is worth reading twice: a login request with the ``password``
field **missing entirely** returns **401**, not the 422 a validation failure
would normally produce. The tests assert what the API does, and the
inconsistency is recorded in ``shared/contracts/README.md`` to raise with the
API owners.
"""

import re
from collections.abc import Callable

import pytest

from framework.clients.auth_client import AuthClient
from framework.models.auth import LoginRequest
from framework.models.test_account import TestAccount
from framework.support import test_values

_JWT_SHAPE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
_WRONG_PASSWORD = "definitely-not-the-password"  # noqa: S105 - a deliberately invalid value
_MAXIMUM_LOCKOUT_ATTEMPTS = 10
_LOCKED_STATUS = 423


def _flip_last_character(token: str) -> str:
    """Changes the final character so the JWT signature fails but the shape stays intact."""
    if token[-1] == "A":
        return token[:-1] + "B"
    return token[:-1] + "A"


@pytest.mark.smoke
@pytest.mark.regression
def test_issues_token_when_credentials_are_valid(
    auth_client: AuthClient, disposable_account: TestAccount
) -> None:
    """Valid credentials are accepted and a bearer token is issued."""
    result = auth_client.login_with(disposable_account.email, disposable_account.password)

    assert result.status == 200, "valid credentials must be accepted"
    assert result.body is not None

    login = result.body
    assert login.access_token.strip() != "", "a token is issued"
    assert _JWT_SHAPE.match(login.access_token) is not None, "the token is a three-part JWT"
    assert login.token_type.lower() == "bearer", "the scheme is bearer"
    assert login.expires_in is not None, "an expiry is advertised"
    assert login.expires_in > 0, "the token expires"


@pytest.mark.regression
def test_grants_access_to_own_profile_when_token_is_valid(
    auth_client: AuthClient, disposable_account: TestAccount
) -> None:
    """A freshly issued token is accepted on a protected endpoint."""
    login = auth_client.login_with(disposable_account.email, disposable_account.password)
    assert login.status == 200
    assert login.body is not None

    profile = auth_client.current_user(login.body.bearer_header_value())

    assert profile.status == 200, "a freshly issued token must be accepted"


@pytest.mark.smoke
@pytest.mark.regression
def test_rejects_login_when_password_is_wrong(
    auth_client: AuthClient,
    disposable_account: TestAccount,
    no_internal_detail_leaked: Callable[[str], None],
) -> None:
    """A wrong password is rejected without revealing whether the account exists."""
    result = auth_client.login_with(disposable_account.email, _WRONG_PASSWORD)

    assert result.status == 401, "wrong credentials are unauthorized"
    assert result.body is None, "no token is issued on a failed login"

    error_text = result.error().text()
    assert error_text is not None, "the rejection carries an error body"
    assert error_text.strip() != "", "the rejection is explained"

    # The wording must not distinguish "wrong password" from "no such account", or anyone
    # can enumerate which email addresses hold accounts.
    lowered = error_text.lower()
    assert "password is incorrect" not in lowered
    assert "user not found" not in lowered
    assert "no such user" not in lowered

    no_internal_detail_leaked(result.raw_body)


@pytest.mark.regression
def test_rejects_login_when_password_field_is_missing(
    auth_client: AuthClient, disposable_account: TestAccount
) -> None:
    """A request missing a required field is refused, not partially processed.

    Observed behaviour: 401, not 422. Asserted as-is; see the module docstring.
    """
    incomplete = LoginRequest.without_password(disposable_account.email)

    result = auth_client.login(incomplete)

    assert result.status == 401, "a request missing a required field must be refused"
    assert result.body is None, "no token is issued"

    error_text = result.error().text()
    assert error_text is not None, "the refusal carries an error body"
    assert error_text.strip() != "", "the refusal is explained"


@pytest.mark.regression
def test_rejects_login_when_account_is_unknown(auth_client: AuthClient) -> None:
    """An unknown account is indistinguishable from a wrong password."""
    result = auth_client.login_with(test_values.unique_email(), "any-password")

    assert result.status == 401, "an unknown account is unauthorized"
    assert result.body is None


@pytest.mark.regression
@pytest.mark.destructive
def test_locks_account_when_failed_attempts_are_repeated(
    auth_client: AuthClient, disposable_account: TestAccount
) -> None:
    """Repeated failed logins lock the account rather than allowing unlimited guesses.

    This test exists because the lockout was discovered the hard way, by
    accidentally triggering it on a shared account. Behaviour a suite can break
    itself on is behaviour worth asserting deliberately.

    It is destructive by design, which is exactly why it owns the throwaway
    account it burns. Excluded from every selection except ``-m destructive``.
    """
    locked_at_attempt = 0

    for attempt in range(1, _MAXIMUM_LOCKOUT_ATTEMPTS + 1):
        result = auth_client.login_with(disposable_account.email, "wrong-password")

        if result.status == _LOCKED_STATUS:
            locked_at_attempt = attempt
            break

        assert result.status == 401, (
            f"attempt {attempt} should be rejected as unauthorized until the lockout trips"
        )

    assert locked_at_attempt > 0, (
        "the account must lock after repeated failures, otherwise credentials can be brute forced"
    )

    after_lock = auth_client.login_with(disposable_account.email, disposable_account.password)
    assert after_lock.status == _LOCKED_STATUS, (
        "once locked, even the correct password must be refused until an administrator intervenes"
    )


@pytest.mark.smoke
@pytest.mark.regression
def test_denies_protected_endpoint_when_no_token_is_supplied(
    auth_client: AuthClient, no_internal_detail_leaked: Callable[[str], None]
) -> None:
    """Anonymous access to a protected endpoint is denied."""
    result = auth_client.current_user(None)

    assert result.status == 401, (
        "anonymous access to a protected endpoint must be 401, never 200 and never 500"
    )

    no_internal_detail_leaked(result.raw_body)


@pytest.mark.regression
def test_denies_protected_endpoint_when_token_is_tampered(
    auth_client: AuthClient, disposable_account: TestAccount
) -> None:
    """A token whose signature no longer verifies is rejected."""
    login = auth_client.login_with(disposable_account.email, disposable_account.password)
    assert login.status == 200
    assert login.body is not None

    tampered = _flip_last_character(login.body.access_token)

    result = auth_client.current_user("Bearer " + tampered)

    assert result.status == 401, "a token whose signature no longer verifies must be rejected"
