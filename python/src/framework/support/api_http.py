"""The one ``httpx.Client`` the suite uses, and its redacting event hooks.

One client for the whole run, not one per call: the client holds the connection
pool and the configured timeout, and a shared instance guarantees every call
goes through the hooks below, so no individual client method can forget to log.

``raise_for_status`` is **not** configured anywhere. Negative paths are
first-class, and a client that throws on error statuses forces every negative
test into exception handling, which hides what is actually being asserted.

Retries are transport-level only: ``httpx.HTTPTransport(retries=2)`` retries
connection-establishment failures and never replays a request that reached the
server, so a 4xx or 5xx is never retried. 5xx is deliberately not retried —
neither shipped module retries above the transport, and a 5xx from the shared
demo target is a result the team wants to see rather than smooth over. If 5xx
retries are ever added they go here as a custom transport, with a counter
surfaced in the report so a retried-then-passed call is visible.

One ordering detail follows from ``functools.cache``: the ``api_client``
session fixture closes the client on teardown, and a cache still holding a
**closed** client would hand it out to anything that asked afterwards. So the
fixture closes it and then calls ``client.cache_clear()``, in that order.
"""

import functools
import time

import allure
import httpx

from framework.support import redaction, run_context, test_log
from framework.support.config import load_config

_MAX_BODY_CHARACTERS = 20_000
_CORRELATION_HEADER = "X-Correlation-Id"
_START_EXTENSION = "af_started_at"
_CORRELATION_EXTENSION = "af_correlation_id"


@functools.cache
def client() -> httpx.Client:
    """The shared client, built from config on first use."""
    config = load_config()

    return httpx.Client(
        base_url=config.api.base_url + "/",
        # An explicit timeout, never infinite. A hung request should fail the test with a
        # timeout, not stall the run until CI kills the job.
        timeout=httpx.Timeout(config.timeouts.api_ms / 1000),
        transport=httpx.HTTPTransport(retries=2),
        headers={"Accept": "application/json"},
        event_hooks={"request": [_on_request], "response": [_on_response]},
    )


def _on_request(request: httpx.Request) -> None:
    correlation_id = run_context.next_correlation_id()
    request.headers[_CORRELATION_HEADER] = correlation_id
    request.extensions[_CORRELATION_EXTENSION] = correlation_id
    request.extensions[_START_EXTENSION] = time.monotonic()

    allure.attach(
        _describe_request(request, correlation_id),
        name=f"API request {correlation_id}",
        attachment_type=allure.attachment_type.TEXT,
    )


def _on_response(response: httpx.Response) -> None:
    # Read first: in a sync event hook the body has not been read yet and touching
    # .text without this raises ResponseNotRead.
    response.read()

    correlation_id = _correlation_id_of(response.request)
    elapsed_ms = _elapsed_ms_of(response.request)

    test_log.info(
        f"{response.request.method} {response.request.url} -> {response.status_code} "
        f"in {elapsed_ms}ms [{correlation_id}]"
    )

    allure.attach(
        _describe_response(response, correlation_id, elapsed_ms),
        name=f"API response {correlation_id}",
        attachment_type=allure.attachment_type.TEXT,
    )


def _correlation_id_of(request: httpx.Request) -> str:
    stored = request.extensions.get(_CORRELATION_EXTENSION)
    if isinstance(stored, str):
        return stored
    return "(no correlation id)"


def _elapsed_ms_of(request: httpx.Request) -> int:
    started_at = request.extensions.get(_START_EXTENSION)
    if isinstance(started_at, float):
        return int((time.monotonic() - started_at) * 1000)
    return 0


def _describe_request(request: httpx.Request, correlation_id: str) -> str:
    lines = [
        f"{request.method} {request.url}",
        f"correlationId: {correlation_id}",
        "--- headers ---",
    ]
    lines.extend(_describe_headers(request.headers))

    body = _body_text_of(request)
    if body is not None:
        lines.append("--- body ---")
        redacted = redaction.body(_truncate(body))
        if redacted is None:
            redacted = ""
        lines.append(redacted)

    return "\n".join(lines)


def _describe_response(response: httpx.Response, correlation_id: str, elapsed_ms: int) -> str:
    lines = [
        f"status: {response.status_code} {response.reason_phrase}",
        f"elapsedMs: {elapsed_ms}",
        f"correlationId: {correlation_id}",
        "--- headers ---",
    ]
    lines.extend(_describe_headers(response.headers))

    lines.append("--- body ---")
    redacted = redaction.body(_truncate(response.text))
    if redacted is None:
        redacted = ""
    lines.append(redacted)

    return "\n".join(lines)


def _describe_headers(headers: httpx.Headers) -> list[str]:
    """Every header value passed through redaction by name.

    A header block is never written verbatim: that is the whole point of having
    one choke point.
    """
    described: list[str] = []
    for name, value in headers.items():
        safe = redaction.header(name, value)
        if safe is None:
            safe = ""
        described.append(f"{name}: {safe}")
    return described


def _body_text_of(request: httpx.Request) -> str | None:
    content = request.content
    if len(content) == 0:
        return None
    return content.decode("utf-8", errors="replace")


def _truncate(body: str | None) -> str:
    if body is None or body == "":
        return ""
    if len(body) <= _MAX_BODY_CHARACTERS:
        return body
    return body[:_MAX_BODY_CHARACTERS] + "\n... truncated for the report ..."
