"""Identity for a single execution of the suite.

Mirrors the shipped ``RunContext.cs`` and ``RunContext.java`` field for field.

The run id ties together every generated value, every log line and every
correlation header from one run. When a test fails in CI and leaves data
behind, the run id is what lets you find both the log and the orphaned record.
Set ``AF_RUN_ID`` to reuse an id, which is useful when re-running a single test
against data an earlier run created.

The run id is deliberately shared between processes that belong to one pipeline
run, so :func:`process_tag` is what keeps a generated identity unique per
process. That sharing is also what broke the suite once: the Java and C# jobs
of one workflow run resolved the same run id, restarted their own counters at
1, and the second job re-registered the first job's email addresses, so the API
answered ``409``.

**Run id under xdist — a Python-only problem.** In C# and Java one process is
one run. With ``pytest-xdist`` the controller spawns N worker processes, each
importing this module afresh, so with no ``AF_RUN_ID`` or ``GITHUB_RUN_ID`` set
each worker would mint a *different* run id and scatter failure artifacts
across N directories. The root ``conftest.py`` pins the id with
``os.environ.setdefault("AF_RUN_ID", run_context.run_id())`` in
``pytest_configure``, which the controller runs before xdist spawns anything;
execnet's popen gateway inherits ``os.environ``, so every worker resolves the
controller's value. The **process tag** is deliberately not pinned: each worker
gets its own eight hex characters, which is precisely what keeps generated
emails unique across workers.

``PYTEST_XDIST_WORKER`` is deliberately **not** folded into the tag. The
per-process random already separates workers, and the format must stay
byte-identical across the three modules.

Identity format, identical in all three modules::

    email           af-{runId}-{processTag}-{n}@example.invalid
    name            {prefix}-af-{runId}-{processTag}-{n}
    correlation id  af-{runId}-{processTag}-{n}

    in CI           af-37529901169-python-1-9f3c1a7e-5@example.invalid
    locally         af-4b1e9c70-9f3c1a7e-5@example.invalid
"""

import os
import threading
import uuid

_SEQUENCE_LOCK = threading.Lock()
_sequence = 0


def _short_random_hex() -> str:
    return uuid.uuid4().hex[:8]


def _safe_tag_part(value: str | None, max_length: int) -> str:
    """Lowercase letters and digits only, so a tag is safe in an email local part and a path.

    ``str.isalnum()`` is Unicode-aware and so is C#'s ``char.IsLetterOrDigit``,
    which is why no normalisation is added: matching the reference is the
    requirement, and a GitHub job key is ASCII in practice anyway.
    """
    if value is None or value.strip() == "":
        return ""

    safe: list[str] = []
    for character in value.lower():
        if len(safe) == max_length:
            break
        if character.isalnum():
            safe.append(character)

    return "".join(safe)


def _resolve_run_id() -> str:
    from_environment = os.environ.get("AF_RUN_ID")
    if from_environment is not None and from_environment.strip() != "":
        return from_environment.strip()

    # A CI build number makes a run traceable back to the pipeline that produced it.
    ci_run = os.environ.get("GITHUB_RUN_ID")
    if ci_run is not None and ci_run.strip() != "":
        return ci_run.strip()

    return _short_random_hex()


def _build_process_tag() -> str:
    """The CI per-job key and attempt number when present, followed by random hex.

    Random alone is only probabilistically unique. Where the CI provider hands
    us a key that is unique by construction within one run — the job key, plus
    the attempt number, which is what distinguishes a re-run since
    ``GITHUB_RUN_ID`` is preserved across attempts — that key is folded in, so
    the two processes that actually collided cannot collide again. The random
    part is always present: it is what separates two local processes, two test
    hosts inside one job, and two legs of a matrix job, since the job key does
    not include matrix values.
    """
    random_part = _short_random_hex()

    job_part = _safe_tag_part(os.environ.get("GITHUB_JOB"), max_length=12)
    if job_part == "":
        return random_part

    attempt_part = _safe_tag_part(os.environ.get("GITHUB_RUN_ATTEMPT"), max_length=2)
    if attempt_part == "":
        attempt_part = "1"

    return job_part + "-" + attempt_part + "-" + random_part


_RUN_ID: str = _resolve_run_id()
_PROCESS_TAG: str = _build_process_tag()


def run_id() -> str:
    """Short, lowercase, filename-safe identifier for this run."""
    return _RUN_ID


def process_tag() -> str:
    """Discriminator for this process, minted once.

    Makes generated identities unique between two processes that share a run id.
    """
    return _PROCESS_TAG


def next_sequence() -> int:
    """Next value in the run-scoped sequence. Keeps generated data unique."""
    global _sequence
    with _SEQUENCE_LOCK:
        _sequence += 1
        return _sequence


def next_correlation_id() -> str:
    """Next correlation id for an outbound request.

    Formatted ``af-{runId}-{processTag}-{n}`` so a server-side log search on the
    run id returns every request the suite made.
    """
    return f"af-{_RUN_ID}-{_PROCESS_TAG}-{next_sequence()}"
