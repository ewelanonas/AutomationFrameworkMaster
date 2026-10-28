/**
 * Registration payload for `POST /users/register`.
 *
 * Plain `z.object()` throughout — see `product.ts`'s header.
 *
 * Every field is required, mirroring `account_flow.py`'s payload field for field.
 * `dob` is declared as `dob`: Python needs a `serialization_alias` because
 * `date_of_birth` is the Python-side name, and that workaround has no counterpart
 * here.
 */

import { z } from 'zod';

import { MARKER } from '@support/redaction';

/** A postal address, as the registration endpoint expects it. */
export const postalAddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  postal_code: z.string(),
});
export type PostalAddress = z.infer<typeof postalAddressSchema>;

/** A new customer account. */
export const registerRequestSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  address: postalAddressSchema,
  phone: z.string(),
  dob: z.string(),
  email: z.string(),
  password: z.string(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * The registration request as a log-safe string, with the password replaced by
 * the marker. See `auth.ts`'s header for why this is a function rather than a
 * `toString()` override.
 */
export function describeRegisterRequest(request: RegisterRequest): string {
  return `RegisterRequest { email = ${request.email}, password = ${MARKER} }`;
}
