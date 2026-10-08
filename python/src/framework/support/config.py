"""Typed configuration, resolved once per process, failing loudly when incomplete.

Resolution order, **lowest precedence first**, identical to ``ConfigLoader.cs``
and ``ConfigLoader.java``:

1. built-in defaults in code,
2. ``shared/environments/<env>.json`` — non-secret defaults, committed,
3. ``.env`` at the repository root — local overrides, gitignored,
4. real process environment variables — always win; this is how CI injects
   secrets.

Resolution never falls back to a production URL and never substitutes a blank
for a missing setting: a suite that silently points somewhere unexpected is
worse than one that refuses to start.

Built-in defaults
-----------------

Verified against the shipped ``ConfigLoader.cs`` and ``ConfigLoader.java``;
both agree on every row.

==============================  ===============
Key                             Default
==============================  ===============
``timeouts.elementMs``          10000
``timeouts.navigationMs``       30000
``timeouts.apiMs``              30000
``timeouts.workflowMs``         60000
``ui.locale``                   ``en-US``
``ui.timezoneId``               ``UTC``
``ui.viewport.width``           1440
``ui.viewport.height``          900
``api.loginPath``               ``/users/login``
``execution.headless``          ``True``
``execution.browser``           ``chromium``
``execution.testIdAttribute``   ``data-testid``
==============================  ===============

**Coverage:** defaults cover everything except ``ui.baseUrl`` and
``api.baseUrl``, which have no default at all and are fatal when missing.
``execution.testIdAttribute`` defaults to ``data-testid`` and
``shared/environments/local.json`` overrides it to ``data-test``; this module
never hardcodes either.

Why ``extra="forbid"`` on the models
------------------------------------

All six models carry ``ConfigDict(frozen=True, extra="forbid")``, and the
reason is **construction in code**, not validation of the descriptor file: a
mistyped keyword argument inside the loader below fails immediately instead of
yielding a config with a silently missing field.

It does **not** validate ``shared/environments/<env>.json``. The descriptor is
read key by key exactly as ``ConfigLoader.cs`` reads it, and unknown keys in it
are ignored — ``local.json`` legitimately carries ``name`` and ``description``
and a nested ``ui.viewport`` object against a flat :class:`UiConfig`. **Do not
parse the descriptor file into a model.**

``pydantic-settings`` is deliberately not used: the precedence chain and the
fail-fast message text must be identical to the two hand-written loaders, and
bending a settings library into that shape is more code and less parity.
"""

import functools
import json
import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from framework.support import repo_paths, run_context, test_log

_MINIMUM_TIMEOUT_MS = 1_000
_MAXIMUM_TIMEOUT_MS = 600_000


class UiConfig(BaseModel):
    """Browser-facing settings. Locale and timezone are pinned so formatting is deterministic."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    base_url: str
    locale: str
    timezone_id: str
    viewport_width: int
    viewport_height: int


class ApiConfig(BaseModel):
    """Service-facing settings."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    base_url: str
    login_path: str


class Timeouts(BaseModel):
    """The single timeout policy.

    Tests and page objects never write a millisecond literal; they ask for the
    named timeout that matches what they are waiting on.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    element_ms: int
    navigation_ms: int
    api_ms: int
    workflow_ms: int


class ExecutionConfig(BaseModel):
    """How the run executes. ``test_id_attribute`` is per-application, not universal."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    headless: bool
    browser: str
    test_id_attribute: str


class Credentials(BaseModel):
    """Test-account credentials, supplied only through the environment.

    Accessed through ``require_*`` rather than read directly, so a suite of API
    and contract tests that needs no login still runs, while a test that does
    need one fails immediately with a message naming the missing variable
    instead of sending an empty password and reporting a puzzling 401.

    Nothing in this module's test inventory calls these: every authenticating
    test registers its own disposable account. They exist because the other two
    modules have them and a future test against a non-public target will need
    them.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    username: str | None = None
    password: str | None = None
    admin_username: str | None = None
    admin_password: str | None = None

    def require_username(self) -> str:
        return self._require(self.username, "AF_AUTH_USERNAME")

    def require_password(self) -> str:
        return self._require(self.password, "AF_AUTH_PASSWORD")

    def require_admin_username(self) -> str:
        return self._require(self.admin_username, "AF_AUTH_ADMIN_USERNAME")

    def require_admin_password(self) -> str:
        return self._require(self.admin_password, "AF_AUTH_ADMIN_PASSWORD")

    def has_customer_credentials(self) -> bool:
        """True when the customer credentials are present, for tests that skip rather than fail."""
        if self.username is None or self.username.strip() == "":
            return False
        return self.password is not None and self.password.strip() != ""

    @staticmethod
    def _require(value: str | None, variable_name: str) -> str:
        if value is None or value.strip() == "":
            raise RuntimeError(
                f"This test needs a credential that is not configured: {variable_name}. "
                "Copy .env.example to .env and fill it in, or export the variable. "
                "See .env.example for the demo values."
            )
        return value


class AppConfig(BaseModel):
    """Typed, immutable view of the resolved environment.

    Nothing outside ``support/`` reads an environment variable directly.
    Everything goes through this model, so there is one place to look when a
    value is wrong and one place to change when a setting is added.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    env_name: str
    ui: UiConfig
    api: ApiConfig
    timeouts: Timeouts
    execution: ExecutionConfig
    credentials: Credentials


@functools.cache
def load_config() -> AppConfig:
    """The resolved configuration for this process, built once.

    ``functools.cache`` on a zero-argument function is the Python equivalent of
    the ``lock``-guarded static field the other two loaders use, and it is
    explicit rather than clever.
    """
    config = _load()
    _log_resolved_targets(config)
    return config


def _load() -> AppConfig:
    env_name = _resolve_env_name()
    environment_file = repo_paths.environments() / (env_name + ".json")

    if not environment_file.is_file():
        raise RuntimeError(
            f"No environment descriptor at {environment_file}. Create it, or select another "
            "with AF_ENV=<name>."
        )

    file = _read_environment_file(environment_file)
    dot_env = _read_dot_env_file()

    ui_section = _section_of(file, "ui")
    api_section = _section_of(file, "api")
    timeouts_section = _section_of(file, "timeouts")
    execution_section = _section_of(file, "execution")
    viewport_section = _section_of(ui_section, "viewport")

    ui_base_url = _value_of("AF_UI_BASEURL", dot_env, ui_section.get("baseUrl"))
    api_base_url = _value_of("AF_API_BASEURL", dot_env, api_section.get("baseUrl"))

    missing: list[str] = []
    if _is_blank(ui_base_url):
        missing.append("ui.baseUrl (or AF_UI_BASEURL)")
    if _is_blank(api_base_url):
        missing.append("api.baseUrl (or AF_API_BASEURL)")

    if len(missing) > 0:
        raise RuntimeError(
            f"Configuration is incomplete for environment '{env_name}'. Missing: "
            + ", ".join(missing)
            + f". Checked {environment_file}, the .env file, and process environment variables."
        )

    ui = UiConfig(
        base_url=_strip_trailing_slash(str(ui_base_url)),
        locale=_text_or(ui_section.get("locale"), "en-US"),
        timezone_id=_text_or(ui_section.get("timezoneId"), "UTC"),
        viewport_width=_int_or(_number_like_of(viewport_section, "width"), 1440),
        viewport_height=_int_or(_number_like_of(viewport_section, "height"), 900),
    )

    api = ApiConfig(
        base_url=_strip_trailing_slash(str(api_base_url)),
        login_path=_text_or(api_section.get("loginPath"), "/users/login"),
    )

    timeouts = Timeouts(
        element_ms=_int_of(
            "AF_TIMEOUTS_ELEMENTMS", dot_env, _number_like_of(timeouts_section, "elementMs"), 10_000
        ),
        navigation_ms=_int_of(
            "AF_TIMEOUTS_NAVIGATIONMS",
            dot_env,
            _number_like_of(timeouts_section, "navigationMs"),
            30_000,
        ),
        api_ms=_int_of(
            "AF_TIMEOUTS_APIMS", dot_env, _number_like_of(timeouts_section, "apiMs"), 30_000
        ),
        workflow_ms=_int_of(
            "AF_TIMEOUTS_WORKFLOWMS",
            dot_env,
            _number_like_of(timeouts_section, "workflowMs"),
            60_000,
        ),
    )

    execution = ExecutionConfig(
        headless=_boolean_of("AF_HEADLESS", dot_env, execution_section.get("headless"), True),
        browser=_text_of("AF_BROWSER", dot_env, execution_section.get("browser"), "chromium"),
        test_id_attribute=_text_or(execution_section.get("testIdAttribute"), "data-testid"),
    )

    credentials = Credentials(
        username=_environment_value("AF_AUTH_USERNAME", dot_env),
        password=_environment_value("AF_AUTH_PASSWORD", dot_env),
        admin_username=_environment_value("AF_AUTH_ADMIN_USERNAME", dot_env),
        admin_password=_environment_value("AF_AUTH_ADMIN_PASSWORD", dot_env),
    )

    return AppConfig(
        env_name=env_name,
        ui=ui,
        api=api,
        timeouts=timeouts,
        execution=execution,
        credentials=credentials,
    )


def _log_resolved_targets(config: AppConfig) -> None:
    # Written once, and deliberately. The single most common wasted debugging hour is a suite
    # that was pointing somewhere other than where the engineer assumed.
    test_log.info(
        f"Environment '{config.env_name}' resolved. UI={config.ui.base_url} "
        f"API={config.api.base_url} headless={config.execution.headless} "
        f"browser={config.execution.browser} "
        f"testIdAttribute={config.execution.test_id_attribute} "
        f"elementMs={config.timeouts.element_ms} runId={run_context.run_id()} "
        f"processTag={run_context.process_tag()}"
    )


def _resolve_env_name() -> str:
    from_environment = os.environ.get("AF_ENV")
    if from_environment is None or from_environment.strip() == "":
        return "local"
    return from_environment.strip()


def _read_environment_file(path: Path) -> dict[str, object]:
    """Reads the descriptor as a plain mapping.

    Deliberately not parsed into a model: see the module docstring. Unknown keys
    are ignored because ``local.json`` legitimately carries metadata this module
    does not read.
    """
    text = path.read_text(encoding="utf-8")
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise RuntimeError(
            f"The environment descriptor at {path} must hold a JSON object at its root."
        )
    return parsed


def _section_of(parent: dict[str, object], key: str) -> dict[str, object]:
    """One nested object from the descriptor, or an empty mapping when absent."""
    value = parent.get(key)
    if isinstance(value, dict):
        return value
    return {}


def _number_like_of(section: dict[str, object], key: str) -> int | str | None:
    """Narrows one descriptor value to the two shapes a timeout can legitimately arrive as.

    ``json.loads`` turns ``"elementMs": 10000`` into an ``int`` and
    ``"elementMs": "10000"`` into a ``str``. Anything else in the descriptor is
    malformed and falls through to the built-in default, exactly as
    ``IntOr``/``intOr`` do in the two shipped loaders.

    ``bool`` is excluded explicitly because it is a subclass of ``int`` in
    Python, and ``"elementMs": true`` is a mistake, not a timeout of 1 ms.
    """
    value = section.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return value
    return None


def _read_dot_env_file() -> dict[str, str]:
    """Reads ``.env`` at the repository root if it exists.

    Absent is normal: CI injects real environment variables instead. Mirrors
    ``ReadDotEnvFile`` — skip blanks and ``#``, split on the first ``=``, strip
    one matching pair of quotes, ignore empty values.
    """
    values: dict[str, str] = {}
    path = repo_paths.repo_root() / ".env"

    if not path.is_file():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line == "" or line.startswith("#"):
            continue

        separator = line.find("=")
        if separator <= 0:
            continue

        key = line[:separator].strip()
        value = _unquote(line[separator + 1 :].strip())
        if value != "":
            values[key] = value

    return values


def _unquote(value: str) -> str:
    if len(value) >= 2:
        double_quoted = value.startswith('"') and value.endswith('"')
        single_quoted = value.startswith("'") and value.endswith("'")
        if double_quoted or single_quoted:
            return value[1:-1]
    return value


def _environment_value(variable_name: str, dot_env: dict[str, str]) -> str | None:
    """Process environment beats .env; .env beats nothing. Neither falls back to the JSON file."""
    from_process = os.environ.get(variable_name)
    if from_process is not None and from_process.strip() != "":
        return from_process.strip()

    from_dot_env = dot_env.get(variable_name)
    if from_dot_env is not None and from_dot_env.strip() != "":
        return from_dot_env.strip()

    return None


def _value_of(variable_name: str, dot_env: dict[str, str], fallback: object | None) -> str | None:
    from_environment = _environment_value(variable_name, dot_env)
    if from_environment is not None:
        return from_environment

    if isinstance(fallback, str):
        return fallback

    return None


def _text_of(
    variable_name: str, dot_env: dict[str, str], fallback: object | None, default_value: str
) -> str:
    resolved = _value_of(variable_name, dot_env, fallback)
    if _is_blank(resolved):
        return default_value
    return str(resolved)


def _boolean_of(
    variable_name: str, dot_env: dict[str, str], fallback: object | None, default_value: bool
) -> bool:
    from_environment = _environment_value(variable_name, dot_env)
    if from_environment is not None:
        return from_environment.lower() == "true"

    if isinstance(fallback, bool):
        return fallback

    return default_value


def _text_or(value: object | None, default_value: str) -> str:
    if isinstance(value, str) and value.strip() != "":
        return value
    return default_value


def _int_or(value: int | str | None, default_value: int) -> int:
    if isinstance(value, bool):
        return default_value
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip() != "":
        try:
            return int(value.strip())
        except ValueError:
            return default_value
    return default_value


def _int_of(
    variable_name: str,
    dot_env: dict[str, str],
    fallback: int | str | None,
    default_value: int,
) -> int:
    """A timeout in ms: the environment variable, else the environment file, else the default.

    Unlike :func:`_int_or`, a malformed or out-of-range *environment variable*
    raises rather than falling back. Someone who sets this is deliberately
    changing the waiting policy, usually to fix a failing pipeline; silently
    ignoring a typo would mean the run behaves exactly as before and the
    engineer concludes the timeout was not the problem. The lower bound also
    catches writing seconds where milliseconds are expected.

    ``fallback`` is typed ``int | str | None`` rather than ``object | None``
    because ``json.load`` turns ``"elementMs": 10000`` into an ``int`` while a
    descriptor written ``"elementMs": "10000"`` yields a ``str``, and both are
    accepted with an ``isinstance`` branch. ``object`` in a framework signature
    is the shape that forces a ``cast()`` three lines later.
    """
    from_environment = _environment_value(variable_name, dot_env)
    if from_environment is None:
        return _int_or(fallback, default_value)

    try:
        parsed = int(from_environment)
    except ValueError as error:
        raise RuntimeError(
            f"{variable_name} must be a whole number of milliseconds, but was '{from_environment}'."
        ) from error

    if parsed < _MINIMUM_TIMEOUT_MS or parsed > _MAXIMUM_TIMEOUT_MS:
        raise RuntimeError(
            f"{variable_name} must be between {_MINIMUM_TIMEOUT_MS} and {_MAXIMUM_TIMEOUT_MS} "
            f"milliseconds, but was {parsed}."
        )

    return parsed


def _strip_trailing_slash(url: str) -> str:
    if url.endswith("/"):
        return url[:-1]
    return url


def _is_blank(value: str | None) -> bool:
    return value is None or value.strip() == ""
