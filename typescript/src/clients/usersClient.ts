/** User account endpoints. */

import type { RegisterRequest } from '@models/registration';
import type { ApiHttp } from '@support/apiHttp';

import { statusOnly, type ApiResult } from './apiResult';

export class UsersClient {
  constructor(private readonly http: ApiHttp) {}

  /**
   * `POST users/register`. Returns the result whatever the status.
   *
   * Status-only: the endpoint's success body carries nothing a test asserts on,
   * and the flow that calls this reads the status and the raw body.
   */
  async register(request: RegisterRequest): Promise<ApiResult<never>> {
    const response = await this.http.post('users/register', { data: request });

    return statusOnly(response);
  }
}
