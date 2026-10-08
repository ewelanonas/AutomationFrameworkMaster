"""Locates repository-level directories, whatever the launch directory is.

Mirrors ``RepoPaths.cs`` and ``RepoPaths.java``: everything is resolved by
walking up from the current directory looking for a marker, rather than by
hardcoding ``../../..``. A relative path that only works from one launch
directory is the most common reason a suite runs in the IDE but not in CI.

Two things this module deliberately does **not** own:

- **The Allure results directory.** ``allure-pytest`` resolves
  ``--alluredir`` against the *invocation* directory, so the only correct
  source for that path is the runner's own option. The ``run_metadata``
  fixture reads it from ``config.getoption("--alluredir")``; see the root
  ``conftest.py``.
- **Anything a plugin option competes over.** :func:`reports` serves failure
  artifacts, which nothing else writes to.
"""

from pathlib import Path

_MARKER = "shared/environments"
_MAX_LEVELS_UP = 10


def repo_root() -> Path:
    """The repository root: the nearest ancestor holding ``shared/environments``."""
    start = Path.cwd()
    current = start

    for _ in range(_MAX_LEVELS_UP + 1):
        if (current / "shared" / "environments").is_dir():
            return current

        parent = current.parent
        if parent == current:
            break
        current = parent

    raise RuntimeError(
        f"Could not locate the repository root. Looked for a '{_MARKER}' directory in "
        f"'{start}' and up to {_MAX_LEVELS_UP} parents. "
        "Run pytest from the repository's python/ directory: "
        "uv run --directory python pytest"
    )


def environments() -> Path:
    """Directory holding the non-secret environment descriptors."""
    return repo_root() / "shared" / "environments"


def contracts() -> Path:
    """Directory holding the JSON Schema contracts."""
    return repo_root() / "shared" / "contracts"


def reports() -> Path:
    """Directory for this module's reports and failure artifacts.

    Per-module by design: C# uses ``csharp/TestResults``, Java ``java/target``,
    Python ``python/reports``. ``.gitignore`` already covers ``reports/`` at any
    depth.
    """
    return repo_root() / "python" / "reports"
