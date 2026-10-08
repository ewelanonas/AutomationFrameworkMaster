"""An account this test run created and therefore owns."""

from pydantic import BaseModel, ConfigDict

from framework.support.redaction import MARKER


class TestAccount(BaseModel):
    """Credentials for a disposable account this run registered.

    Owning the account is the whole point. A test that needs to send a wrong
    password — to check the rejection, or that the message does not reveal
    whether the account exists — increments a server-side failed-attempt
    counter. On a shared account that counter eventually trips a lockout and
    takes the entire suite down with it, including every happy path. That is not
    hypothetical: when it happened here, the API answered ``423 Locked`` to
    every login across two language modules at once.

    With a per-test account, locking it costs nothing: nobody else will ever use
    it again.

    ``__str__`` and ``__repr__`` are both overridden because this model carries
    a password, and pytest's assertion rewriting prints ``repr``.
    """

    # pytest collects any class named Test*, and would warn that it cannot because this
    # one has a constructor. The name is parity with TestAccount.cs and TestAccount.java,
    # so the collector is told to skip it rather than the model being renamed.
    __test__ = False

    model_config = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)

    email: str
    password: str

    def __str__(self) -> str:
        return f"TestAccount {{ email = {self.email}, password = {MARKER} }}"

    def __repr__(self) -> str:
        return self.__str__()
