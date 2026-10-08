"""The shape of a generated identity, checked without touching the network.

These exist because of a CI failure. Both module jobs of one workflow run
resolved the same run id from ``GITHUB_RUN_ID``, each restarted its own counter
at 1, and the second job re-registered the first job's addresses — the API
answered ``409`` and the suites went red with no code change.
:func:`framework.support.run_context.process_tag` is the discriminator that
fixes it, so it gets checks that do not consult the generator: the format checks
below would pass vacuously if the tag were ever empty.

The cross-process property cannot be proved from inside one process; the CI run
is what covers that. Asserted with ``startswith``/``endswith``, never a regex,
and never pinning the random part.
"""

import pytest

from framework.support import run_context, test_values

_RANDOM_FLOOR_CHARACTERS = 8


@pytest.mark.smoke
def test_embeds_run_id_and_process_tag_when_an_email_is_generated() -> None:
    """A generated email embeds the run id and the process tag, on a reserved domain."""
    email = test_values.unique_email()

    assert email.startswith(f"af-{run_context.run_id()}-{run_context.process_tag()}-"), (
        "the af- prefix and the embedded run id are what let a janitor job find leftovers"
    )
    assert email.endswith("@example.invalid"), (
        "generated addresses must never be able to deliver mail"
    )


@pytest.mark.smoke
def test_uses_a_reserved_domain_when_an_email_is_generated() -> None:
    """No segment of a generated address is empty."""
    email = test_values.unique_email()

    # An empty process tag would collapse to "af-{runId}--{n}" and would still satisfy a
    # startswith check built from the same members, so assert the shape directly.
    assert "--" not in email, "an empty segment means a discriminator went missing"


@pytest.mark.smoke
def test_keeps_the_callers_prefix_when_a_name_is_generated() -> None:
    """A generated name keeps its caller's prefix ahead of the run-scoped part."""
    name = test_values.unique_name("order")

    assert name.startswith(f"order-af-{run_context.run_id()}-{run_context.process_tag()}-"), (
        "the prefix says what the record is and the rest says which process made it"
    )


@pytest.mark.smoke
def test_differs_between_calls_when_two_emails_are_generated() -> None:
    """Two calls in one process never return the same address."""
    first = test_values.unique_email()
    second = test_values.unique_email()

    assert first != second, "the run-scoped counter advances on every call"


@pytest.mark.smoke
def test_follows_the_shared_format_when_a_correlation_id_is_generated() -> None:
    """A correlation id carries the same run-scoped identity as a generated email."""
    correlation_id = run_context.next_correlation_id()

    assert correlation_id.startswith(f"af-{run_context.run_id()}-{run_context.process_tag()}-"), (
        "a server-side log search on the run id must return every request the suite made"
    )
    assert "--" not in correlation_id, "an empty segment means a discriminator went missing"


@pytest.mark.smoke
def test_is_safe_in_an_email_local_part_when_the_process_tag_is_built() -> None:
    """The process tag is present, minted once, and safe in an email local part or a path."""
    tag = run_context.process_tag()

    assert tag.strip() != "", "the tag is what keeps two processes apart"
    assert len(tag) >= _RANDOM_FLOOR_CHARACTERS, "the random floor is 8 hex characters"
    assert tag == run_context.process_tag(), "the tag is minted once per process"

    for character in tag:
        allowed = ("a" <= character <= "z") or character.isdigit() or character == "-"
        assert allowed, f"'{character}' is not safe in an email local part or a path"
