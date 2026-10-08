"""The timeout-override helper, checked under a patched environment.

Unlike C#'s cached static loader, ``load_config`` is ``functools.cache`` on a
plain function, so a test can reset it and re-resolve under a patched
environment. That closes a gap the C# module has to leave open: the validation
below is not unit-testable there at all.

**The cache reset is symmetric, and that is not optional.** ``monkeypatch``
restores the environment on teardown but cannot un-cache, so clearing the cache
and walking away would leave either an empty cache or a config built under a
patched environment for every later test in this worker — shared mutable state,
and order-dependent.

``isolated_config`` is requested through ``@pytest.mark.usefixtures``, **never
as a parameter**, and that is a lint requirement rather than a preference: the
fixture yields nothing, so taking it as an argument leaves an unused parameter
and Ruff's ``ARG001`` fires on it. The general rule: a fixture that provides no
value is requested with ``usefixtures``; only a fixture whose return value the
test actually uses appears in the signature.

No other file in the module calls ``load_config.cache_clear()``. The only other
legitimate ``cache_clear()`` in the module is ``api_http.client`` on its session
fixture teardown, for a different reason — a closed client must not stay cached.
"""

from collections.abc import Iterator

import pytest

from framework.support import config
from framework.support.config import load_config


def _no_dot_env_file() -> dict[str, str]:
    """Stands in for ``config._read_dot_env_file`` when a test must exclude ``.env``.

    Passed to ``monkeypatch.setattr`` by name rather than as a lambda, so a
    reader can see what the replacement returns without decoding a callback.
    """
    return {}


@pytest.fixture
def isolated_config() -> Iterator[None]:
    """Resolves config from scratch for this test, and leaves nothing behind."""
    load_config.cache_clear()
    yield
    load_config.cache_clear()


@pytest.mark.usefixtures("isolated_config")
@pytest.mark.smoke
def test_fails_fast_when_a_timeout_override_is_not_an_integer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A malformed AF_TIMEOUTS_* value stops the run rather than being ignored.

    Someone who sets this is deliberately changing the waiting policy, usually
    to fix a failing pipeline. Silently ignoring a typo would mean the run
    behaves exactly as before and the engineer concludes the timeout was not the
    problem.
    """
    monkeypatch.setenv("AF_TIMEOUTS_ELEMENTMS", "not-a-number")

    with pytest.raises(RuntimeError) as failure:
        load_config()

    assert "AF_TIMEOUTS_ELEMENTMS" in str(failure.value), (
        "the message must name the variable the engineer just set"
    )
    assert "not-a-number" in str(failure.value), "and the value it rejected"


@pytest.mark.usefixtures("isolated_config")
@pytest.mark.smoke
def test_fails_fast_when_a_timeout_override_is_out_of_range(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The lower bound catches writing seconds where milliseconds are expected."""
    monkeypatch.setenv("AF_TIMEOUTS_ELEMENTMS", "30")

    with pytest.raises(RuntimeError) as failure:
        load_config()

    message = str(failure.value)
    assert "AF_TIMEOUTS_ELEMENTMS" in message
    assert "1000" in message, "the message names the lower bound"
    assert "600000" in message, "and the upper bound"


@pytest.mark.usefixtures("isolated_config")
@pytest.mark.smoke
def test_falls_through_to_the_environment_file_when_no_override_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With no override, the descriptor wins; with one, it wins instead.

    ``local.json`` carries ``elementMs: 10000`` and is never edited, so this
    also pins the precedence order the other two loaders use.

    Both higher-precedence sources have to be silenced, not just one. The loader
    reads the process environment **and** repo-root ``.env``, and
    ``monkeypatch.delenv`` reaches only the first — a developer who fills in the
    ``AF_TIMEOUTS_ELEMENTMS=`` line that ``.env.example`` invites would
    otherwise see this test fail for a reason unrelated to the behaviour it
    names. The ``.env`` read is replaced for the whole test; the second
    assertion does not need it, because the process environment outranks
    ``.env`` anyway.
    """
    monkeypatch.delenv("AF_TIMEOUTS_ELEMENTMS", raising=False)
    monkeypatch.setattr(config, "_read_dot_env_file", _no_dot_env_file)
    from_file = load_config().timeouts.element_ms
    assert from_file == 10_000, "shared/environments/local.json supplies elementMs"

    load_config.cache_clear()
    monkeypatch.setenv("AF_TIMEOUTS_ELEMENTMS", "30000")
    from_environment = load_config().timeouts.element_ms
    assert from_environment == 30_000, "the environment variable wins over the file"
