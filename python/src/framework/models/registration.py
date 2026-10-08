"""Registration payload for ``POST /users/register``."""

from pydantic import BaseModel, ConfigDict, Field

from framework.support.redaction import MARKER

_MODEL_CONFIG = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)


class PostalAddress(BaseModel):
    """A postal address, as the registration endpoint expects it."""

    model_config = _MODEL_CONFIG

    street: str
    city: str
    state: str
    country: str
    postal_code: str


class RegisterRequest(BaseModel):
    """A new customer account.

    ``__str__`` and ``__repr__`` are both overridden because this model carries
    a password, and pytest's assertion rewriting prints ``repr``.
    """

    model_config = _MODEL_CONFIG

    first_name: str
    last_name: str
    address: PostalAddress
    phone: str
    # serialization_alias, not alias: this model is only ever built in Python and dumped
    # outbound, never parsed from a response. A plain alias would make "dob" the
    # constructor's keyword, which reads worse at the one call site and which Pydantic's
    # mypy plugin would then require. model_dump(by_alias=True) honours this.
    date_of_birth: str = Field(serialization_alias="dob")
    email: str
    password: str

    def __str__(self) -> str:
        return f"RegisterRequest {{ email = {self.email}, password = {MARKER} }}"

    def __repr__(self) -> str:
        return self.__str__()
