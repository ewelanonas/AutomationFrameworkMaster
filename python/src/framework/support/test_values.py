"""Generated values that are unique per run and reproducible on demand.

Mirrors ``TestValues.cs`` and ``TestValues.java``. The generator is seeded and
the seed is reported; without that, a failure caused by a particular generated
value can never be reproduced — you get a red test, a re-run that passes, and
no explanation. Set ``AF_DATA_SEED`` to the reported value to replay a run's
data exactly.

Generated identities use reserved test domains only. A real domain in test data
eventually means real email sent to a real person.

**Resolution and reporting are separate functions, deliberately.** ``_SEED`` is
computed at import; the line that makes the seed verifiable is emitted from
:func:`log_seed`, which ``pytest_configure`` calls *after*
``reporting.configure_logging()``. Logging at import would silently lose it:
the root ``conftest.py`` imports this module at module scope, and conftest
import happens before ``pytest_configure`` runs, so the line would go to a
logger with no handler and be dropped. **Nothing in this module logs at import
time.**
"""

import os
import secrets
import threading

from faker import Faker

from framework.support import run_context, test_log


def _resolve_seed() -> int:
    """``AF_DATA_SEED`` when set, otherwise a fresh random one.

    A fixed default would be *worse* than random: it would hide the whole class
    of bug where a test passes only for one particular generated value.

    ``secrets.randbelow`` rather than ``random.randrange`` is not security
    theatre — ``random.*`` trips Ruff's ``S311``, and the choice is between one
    ``# noqa`` on a line nobody will revisit and a stdlib call that needs no
    suppression. It is the direct equivalent of C#'s ``Random.Shared.Next()``
    for this purpose.
    """
    from_environment = os.environ.get("AF_DATA_SEED")
    if from_environment is None or from_environment.strip() == "":
        return secrets.randbelow(2**31)

    try:
        return int(from_environment.strip())
    except ValueError as error:
        raise RuntimeError(
            f"AF_DATA_SEED must be a whole number, but was '{from_environment}'."
        ) from error


_SEED: int = _resolve_seed()
_LOCAL = threading.local()


def seed() -> int:
    """The seed this run is using. Written to the Allure environment block as ``dataSeed``."""
    return _SEED


def log_seed() -> None:
    """Reports the seed. Called from ``pytest_configure``, never at import."""
    test_log.info(
        f"Test data seed: {_SEED}. Set AF_DATA_SEED={_SEED} to reproduce this run's generated data."
    )


def faker() -> Faker:
    """Generator for the current thread, seeded so data is reproducible.

    Seeded with ``instance.seed_instance(_SEED)`` — the per-instance seeder,
    never the ``Faker.seed()`` class method. The class method seeds a generator
    shared by every instance in the process, which under threads means two
    tests interleave draws from one stream and neither is reproducible.
    ``seed_instance`` is the direct equivalent of C#'s
    ``faker.Random = new Randomizer(Seed)``.
    """
    existing: Faker | None = getattr(_LOCAL, "faker", None)
    if existing is not None:
        return existing

    created = Faker()
    created.seed_instance(_SEED)
    _LOCAL.faker = created
    return created


def unique_email() -> str:
    """Unique, run-scoped email on a reserved domain that cannot deliver mail."""
    return (
        f"af-{run_context.run_id()}-{run_context.process_tag()}-"
        f"{run_context.next_sequence()}@example.invalid"
    )


def unique_name(prefix: str) -> str:
    """Unique, run-scoped name prefixed so a janitor job can find leftovers."""
    return (
        f"{prefix}-af-{run_context.run_id()}-{run_context.process_tag()}-"
        f"{run_context.next_sequence()}"
    )


def well_formed_but_missing_id() -> str:
    """An id that is syntactically valid for the target API but certain not to exist.

    Shaped as a 26-character ULID because the demo API rejects anything else
    before it gets as far as looking the record up, which would test the wrong
    thing. A 404 test has to send an id the service accepts as well formed.
    """
    return "0AF00000000000000000000000"


def reserved_phone_number() -> str:
    """A reserved, non-dialable run of zeros. Never a real number.

    The other two modules write this literal inline in ``AccountFlow``; it lives
    here so the two rules governing it — reserved range, never a real number —
    sit next to the email rule they belong with.
    """
    return "0000000000"
