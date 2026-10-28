/**
 * Authentication endpoints.
 *
 * The wrapper is injected for the same reason as in `ProductsClient`: the
 * dependency stays visible and these remain instance methods rather than static
 * helpers wearing a class as a hat.
 */

import { loginResponseSchema, type LoginRequest, type LoginResponse } from '@models/auth';
import type { ApiHttp } from '@support/apiHttp';
import { loadConfig } from '@support/config';

import { resultOf, statusOnly, type ApiResult } from './apiResult';

const CURRENT_USER = 'users/me';

export class AuthClient {
  constructor(private readonly http: ApiHttp) {}

  /**
   * `POST <config.api.loginPath>`. Returns the result whatever the status.
   *
   * The configured path is normalised to a relative path here, mirroring
   * `auth_client.py`'s `lstrip("/")`. `APIRequestContext` resolves a relative path
   * against `baseURL` with URL semantics, where a **leading** slash discards any
   * path the base URL carries — so `/users/login` against `https://host/api` would
   * hit `https://host/users/login`. Python strips it for the mirror-image reason:
   * httpx merges a relative path onto `base_url`'s path.
   *
   * Stripping the leading slash is necessary but not sufficient, and the other half
   * lives in the `apiHttp` fixture: `new URL('users/login', 'https://host/api')` is
   * also `https://host/users/login`, because a base URL with no trailing slash has
   * its last segment treated as a file and discarded. The fixture appends exactly
   * one trailing slash for that reason. Both halves are needed, and only both
   * together make the `/api`-prefix case resolve where Python resolves it.
   */
  async login(request: LoginRequest): Promise<ApiResult<LoginResponse>> {
    const loginPath = loadConfig().api.loginPath.replace(/^\/+/, '');
    const response = await this.http.post(loginPath, { data: bodyOf(request) });

    return resultOf(response, loginResponseSchema);
  }

  /** Convenience for the common case. */
  async loginWith(email: string, password: string): Promise<ApiResult<LoginResponse>> {
    return this.login({ email, password });
  }

  /**
   * `GET users/me`, with or without an `Authorization` header.
   *
   * The optional header is deliberate: the anonymous-access case is a first-class
   * test, not an edge case, and it should not need a different method.
   *
   * An absent argument **omits** the header entirely rather than sending it with an
   * empty value. Those are two different requests, and the one
   * `denies a protected endpoint when no token is supplied` is about is the first:
   * "no token supplied" means the header is absent. An empty header value is a
   * malformed-credential case, which no test in the inventory covers.
   */
  async currentUser(bearerHeaderValue?: string): Promise<ApiResult<never>> {
    if (bearerHeaderValue === undefined) {
      const anonymous = await this.http.get(CURRENT_USER);

      return statusOnly(anonymous);
    }

    const response = await this.http.get(CURRENT_USER, {
      headers: { Authorization: bearerHeaderValue },
    });

    return statusOnly(response);
  }
}

/**
 * The login body with undefined keys dropped.
 *
 * This is what produces the no-`password`-key request the missing-field test
 * needs. The dropping happens at the call site rather than globally, so a test
 * that means to send an explicit null still can.
 */
function bodyOf(request: LoginRequest): Record<string, string> {
  const body: Record<string, string> = { email: request.email };

  if (request.password !== undefined) {
    body['password'] = request.password;
  }

  return body;
}
