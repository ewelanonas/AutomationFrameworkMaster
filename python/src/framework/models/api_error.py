"""An error body, in both the shapes the demo API uses."""

from pydantic import BaseModel, ConfigDict


class ApiError(BaseModel):
    """An error body.

    The demo API is inconsistent: some endpoints return ``{"message": "..."}``
    and others ``{"error": "..."}``. Both are modelled, and :meth:`text`
    returns whichever is present.

    Modelled as-is rather than normalised behind a single field, because a test
    asserting on a tidied-up view would hide the inconsistency instead of
    documenting it. The inconsistency is a finding worth raising with the API
    owners, and is recorded in ``shared/contracts/README.md``.
    """

    model_config = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)

    message: str | None = None
    error: str | None = None

    def text(self) -> str | None:
        """The human-readable text, whichever field carried it. None when neither is present."""
        if self.message is not None and self.message.strip() != "":
            return self.message
        if self.error is not None and self.error.strip() != "":
            return self.error
        return None
