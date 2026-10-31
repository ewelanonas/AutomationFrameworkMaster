/**
 * Login request and response.
 *
 * Plain `z.object()` throughout — see `product.ts`'s header for the rule and the
 * six spellings it excludes.
 *
 * WHY THERE IS A `describe*` FUNCTION INSTEAD OF A `toString()`
 * ------------------------------------------------------------
 * The three shipped modules override `ToString()` / `__str__` / `__repr__` on
 * every credential-bearing shape, so a model that reaches a log line or an
 * assertion message prints the redaction marker instead of the secret. A
 * Zod-inferred type is a **plain object**: there is no class to override, and
 * Playwright's `expect` formatter honours neither `toString()` nor
 * `util.inspect.custom`, so no override would reliably reach a report anyway.
 *
 * The defence here is structural instead. Every credential-bearing shape exports
 * a named `describe*` function returning exactly the string the shipped
 * `ToString()` overrides produce, and that is what a caller writes into a message.
 * The redaction choke point (`redaction.body`) is what catches everything else.
 */

import { z } from 'zod';

import { MARKER } from '@support/redaction';

import { numberFromWireSchema } from './product';

/**
 * Credentials for `POST /users/login`.
 *
 * `password` is **optional**, not nullable, because the missing-password test has
 * to send a body with no `password` key at all rather than an explicit null.
 * Those are different requests and this API treats them differently. `AuthClient`
 * drops the key at the call site when the value is absent, rather than globally,
 * so a test that means to send an explicit null still can.
 */
export const loginRequestSchema = z.object({
  email: z.string(),
  password: z.string().optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** A successful login. */
export const loginResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: numberFromWireSchema.nullish(),
  })
  .describe('loginResponseSchema');
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * The value for an `Authorization` header.
 *
 * The literal scheme, **ignoring `token_type`**. `auth.py`'s
 * `bearer_header_value()` is `"Bearer " + self.access_token`, and the demo API
 * sends `token_type` as lowercase `bearer`, so interpolating it would produce a
 * different header value from the three shipped modules for no reason.
 * `token_type` is *asserted* by `auth.spec.ts` case 1, which is where a change in
 * it should surface.
 */
export function bearerHeaderValue(login: LoginResponse): string {
  return `Bearer ${login.access_token}`;
}

/** The login request as a log-safe string, with the password replaced by the marker. */
export function describeLoginRequest(request: LoginRequest): string {
  return `LoginRequest { email = ${request.email}, password = ${MARKER} }`;
}

/** The login response as a log-safe string, with the token replaced by the marker. */
export function describeLoginResponse(login: LoginResponse): string {
  return (
    `LoginResponse { access_token = ${MARKER}, token_type = ${login.token_type}, ` +
    `expires_in = ${String(login.expires_in)} }`
  );
}
