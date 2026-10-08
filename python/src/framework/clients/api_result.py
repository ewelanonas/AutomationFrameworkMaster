"""The outcome of one API call: status, parsed body, raw text and headers.

This type exists so clients never throw on a non-2xx status. A 403 test and a
200 test then read identically, and neither needs a ``try``/``except``. A client
that throws on error statuses forces every negative test into exception
handling, which hides what is actually being asserted.

The body is only parsed on success. Parsing an error body as the success type
would fail for the wrong reason and bury the real status code.
"""

from dataclasses import dataclass

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from framework.models.api_error import ApiError


class NoBody(BaseModel):
    """No body worth parsing: a status probe, a 204, or a register call.

    The type parameter below is bound to ``BaseModel`` so ``result_of`` can call
    ``model_validate_json``, which means ``ApiResult[None]`` does not type-check
    at any annotation site. This is the answer the other two modules already
    reached: C# has ``public sealed record NoBody;`` beside ``ApiResult`` and
    Java uses ``ApiResult<Void>``. It lives here rather than in ``models/``
    because it is a type-system artefact, not a wire shape.
    """

    model_config = ConfigDict(frozen=True, extra="ignore")


@dataclass(frozen=True)
class ApiResult[T: BaseModel]:
    """One call's outcome.

    ``headers`` keeps ``httpx.Headers`` rather than being flattened into a
    ``dict``. ``httpx.Headers`` is already case-insensitive, which is what C#'s
    ``ResponseHeaders`` exists to provide; a plain ``dict(response.headers)``
    has lowercase keys, so ``result.headers["Content-Type"]`` would raise
    ``KeyError`` for no reason a reader could see. It is a copy, so an
    ``ApiResult`` outlives the response object.
    """

    status: int
    body: T | None
    raw_body: str
    headers: httpx.Headers

    def is_successful(self) -> bool:
        """True when the status is in the 2xx range."""
        return 200 <= self.status < 300

    def error(self) -> ApiError:
        """The error body. Only meaningful for a failed call.

        **Never raises.** A negative test asking for the error text must not
        fail on a non-JSON body. This is a deliberate improvement on C#, which
        calls ``JsonSerializer.Deserialize`` and throws ``JsonException`` when a
        gateway answers with HTML — failing a negative test for the wrong
        reason.
        """
        if self.raw_body.strip() == "":
            return ApiError()

        try:
            return ApiError.model_validate_json(self.raw_body)
        except ValidationError:
            return ApiError()


def result_of[T: BaseModel](response: httpx.Response, model: type[T]) -> ApiResult[T]:
    """Wraps a response, parsing the body only when the status indicates success."""
    status = response.status_code
    raw_body = response.text

    body: T | None = None
    if 200 <= status < 300 and raw_body.strip() != "":
        body = model.model_validate_json(raw_body)

    return ApiResult(
        status=status,
        body=body,
        raw_body=raw_body,
        headers=httpx.Headers(response.headers),
    )


def status_only(response: httpx.Response) -> ApiResult[NoBody]:
    """Wraps a response with no body worth parsing, such as a 204 or a status probe."""
    return ApiResult(
        status=response.status_code,
        body=None,
        raw_body=response.text,
        headers=httpx.Headers(response.headers),
    )
