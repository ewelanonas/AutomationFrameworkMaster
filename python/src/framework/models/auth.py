"""Login request and response.

Both override ``__str__`` **and** ``__repr__`` to print the redaction marker in
place of the secret. Pydantic's generated ``repr`` prints every field, and a
model that leaks its own secret into a log line or an assertion message defeats
the redaction layer from the inside. Both are needed in Python because pytest's
assertion rewriting prints ``repr``, not ``str`` — a difference from C#'s single
``ToString()`` override that matters and is easy to miss.
"""

from pydantic import BaseModel, ConfigDict

from framework.support.redaction import MARKER

_MODEL_CONFIG = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)


class LoginRequest(BaseModel):
    """Credentials for ``POST /users/login``.

    Serialised with ``model_dump(by_alias=True, exclude_none=True)`` at the call
    site in ``AuthClient``, which is what lets a negative test send
    ``{"email": "..."}`` with **no** ``password`` key at all rather than an
    explicit null. Those are different requests and this API treats them
    differently. ``exclude_none`` is spelled out at the call site rather than
    configured globally, because on a model config it would also silence a null
    a test meant to send.
    """

    model_config = _MODEL_CONFIG

    email: str
    password: str | None = None

    @staticmethod
    def of(email: str, password: str) -> "LoginRequest":
        return LoginRequest(email=email, password=password)

    @staticmethod
    def without_password(email: str) -> "LoginRequest":
        """A request with no password key at all, for the missing-required-field case."""
        return LoginRequest(email=email, password=None)

    def __str__(self) -> str:
        return f"LoginRequest {{ email = {self.email}, password = {MARKER} }}"

    def __repr__(self) -> str:
        return self.__str__()


class LoginResponse(BaseModel):
    """A successful login."""

    model_config = _MODEL_CONFIG

    access_token: str
    token_type: str
    expires_in: int | None = None

    def bearer_header_value(self) -> str:
        """The value for an ``Authorization`` header."""
        return "Bearer " + self.access_token

    def __str__(self) -> str:
        return (
            f"LoginResponse {{ access_token = {MARKER}, token_type = {self.token_type}, "
            f"expires_in = {self.expires_in} }}"
        )

    def __repr__(self) -> str:
        return self.__str__()
