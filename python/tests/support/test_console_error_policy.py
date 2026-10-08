"""The console allowlist, checked without a browser."""

import pytest

from framework.support.console_error_policy import significant


@pytest.mark.smoke
def test_filters_the_allowlisted_message_when_console_errors_are_screened() -> None:
    """An allowlisted message is filtered and an unknown one survives."""
    screened = significant(
        [
            "Failed to load resource: the server responded with a status of 401",
            "ERR_BLOCKED_BY_CLIENT",
            "   ",
            "TypeError: cannot read properties of undefined",
        ]
    )

    assert screened == ["TypeError: cannot read properties of undefined"], (
        "the anonymous-load 401 and a client-side blocker are documented noise; a real "
        "page error is not"
    )
