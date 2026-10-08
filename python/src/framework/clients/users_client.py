"""User account endpoints."""

import httpx

from framework.clients.api_result import ApiResult, NoBody, status_only
from framework.models.registration import RegisterRequest


class UsersClient:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def register(self, register_request: RegisterRequest) -> ApiResult[NoBody]:
        """``POST /users/register``. Returns the result whatever the status."""
        response = self._http.post(
            "users/register",
            json=register_request.model_dump(by_alias=True, exclude_none=True),
        )
        return status_only(response)
