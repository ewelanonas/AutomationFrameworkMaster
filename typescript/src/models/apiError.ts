/**
 * An error body, in both the shapes the demo API uses.
 *
 * The API is inconsistent: some endpoints answer `{"message": "..."}` and others
 * `{"error": "..."}`. **Both** are modelled, both optional, and
 * {@link errorText} returns whichever is present.
 *
 * Modelled as-is rather than normalised behind a single field, because a test
 * asserting on a tidied-up view would hide the inconsistency instead of
 * documenting it. It is a finding worth raising with the API owners and is
 * already recorded in `shared/contracts/README.md`.
 *
 * Plain `z.object()` — see `product.ts`'s header.
 */

import { z } from 'zod';

export const apiErrorSchema = z.object({
  message: z.string().nullish(),
  error: z.string().nullish(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * The human-readable text, whichever field carried it. `undefined` when neither
 * is present, which is the normal outcome for a blank or non-JSON body.
 */
export function errorText(apiError: ApiError): string | undefined {
  const message = apiError.message;
  if (message !== undefined && message !== null && message.trim() !== '') {
    return message;
  }

  const error = apiError.error;
  if (error !== undefined && error !== null && error.trim() !== '') {
    return error;
  }

  return undefined;
}
