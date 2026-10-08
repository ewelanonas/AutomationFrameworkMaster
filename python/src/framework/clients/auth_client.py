"""Authentication endpoints.

The ``httpx.Client`` is injected for the same reason as in ``ProductsClient``:
the dependency stays visible and these remain instance methods rather than
static helpers wearing a class as a hat.
"""

import httpx

from framework.clients.api_result import ApiResult, NoBody, result_of, status_only
from framework.models.auth import LoginRequest, LoginResponse
from framework.support.config import load_config


class AuthClient:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def login(self, login_request: LoginRequest) -> ApiResult[LoginResponse]:
        """``POST /users/login``. Returns the result whatever the status.

        ``exclude_none=True`` is what produces the no-password-key request that
        the missing-required-field test needs.
        """
        login_path = load_config().api.login_path.lstrip("/")
        response = self._http.post(
            login_path,
            json=login_request.model_dump(by_alias=True, exclude_none=True),
        )
        return result_of(response, LoginResponse)

    def login_with(self, email: str, password: str) -> ApiResult[LoginResponse]:
        """Convenience for the common case."""
        return self.login(LoginRequest.of(email, password))

    def current_user(self, bearer_header_value: str | None) -> ApiResult[NoBody]:
        """``GET /users/me``, with or without an ``Authorization`` header.

        The nullable header is deliberate: the anonymous-access case is a
        first-class test, not an edge case, and it should not need a different
        method.

        ``None`` **omits** the header entirely rather than sending it with an
        empty value. Those are two different requests, and the one
        ``test_denies_protected_endpoint_when_no_token_is_supplied`` is about is
        the first: "no token supplied" means the header is absent. An empty
        header value is a malformed-credential case, which no test in the
        inventory covers.
        """
        if bearer_header_value is None:
            response = self._http.get("users/me")
        else:
            response = self._http.get("users/me", headers={"Authorization": bearer_header_value})

        return status_only(response)
