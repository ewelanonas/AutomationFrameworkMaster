/**
 * The outcome of one API call: status, parsed body, raw text and headers.
 *
 * This type exists so clients never throw on a non-2xx status. A 401 test and a
 * 200 test then read identically, and neither needs a `try`/`catch`. A client
 * that throws on error statuses forces every negative test into exception
 * handling, which hides what is actually being asserted.
 *
 * `isSuccessful` and `errorOf` are **free functions**, where Python has them as
 * methods on `ApiResult`. Same reason `Credentials`' four accessors are
 * functions: `ApiResult<T>` is plain readonly data that {@link resultOf} builds
 * literally, and a method on it would make it the one result object in the module
 * that is not. The names and the behaviour are Python's; only the call shape
 * changes. Recorded in design §17.1 row 26.
 *
 * `statusOnly` returns `ApiResult<never>`. The `NoBody` marker type the other
 * three modules need — a `NoBody` record in C#, `ApiResult<Void>` in Java, a
 * `BaseModel` subclass in Python — has a simpler answer here, so none is added.
 *
 * HEADER NAMES ARE LOWERCASE
 * --------------------------
 * `APIResponse.headers()` already returns lowercase keys, and this module
 * flattens them into a plain record without changing that. JavaScript object
 * lookup is case-sensitive, so **any lookup against `result.headers` uses a
 * lowercase literal** — `result.headers['content-type']`, never
 * `'Content-Type'`. C# wraps its headers to get case-insensitive lookup;
 * stating the rule is cheaper than building a wrapper nothing in the inventory
 * needs.
 *
 * The body is read here with `await response.text()`, which is the second read of
 * a body `ApiHttp` already read for its attachment. That is correct and
 * deliberate: Playwright buffers the body, so the reads agree, and nothing
 * disposes the response.
 */

import type { APIResponse } from '@playwright/test';
import type { ZodType } from 'zod';

import { apiErrorSchema, type ApiError } from '@models/apiError';
import * as redaction from '@support/redaction';
import * as testLog from '@support/testLog';

const MAX_BODY_CHARACTERS = 2_000;
const TRUNCATION_NOTICE = '... truncated for the report ...';

export interface ApiResult<T> {
  readonly status: number;
  readonly body: T | undefined;
  readonly rawBody: string;
  readonly headers: Record<string, string>;
}

/** True when the status is in the 2xx range. */
export function isSuccessful(result: ApiResult<unknown>): boolean {
  return result.status >= 200 && result.status < 300;
}

/**
 * The error body. Only meaningful for a failed call.
 *
 * **Never throws.** A negative test asking for the error text must not fail on a
 * blank or non-JSON body — a gateway answering with HTML would otherwise fail a
 * negative test for the wrong reason, which is the C# behaviour Python
 * deliberately improved on. Both the parse and the schema check fall back to an
 * empty {@link ApiError}.
 */
export function errorOf(result: ApiResult<unknown>): ApiError {
  if (result.rawBody.trim() === '') {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.rawBody);
  } catch {
    // One of exactly two sanctioned `catch` blocks in the module: a non-JSON error
    // body is a normal outcome here, not a defect, and the real failure is the
    // status the test is about to assert on.
    return {};
  }

  const outcome = apiErrorSchema.safeParse(parsed);
  if (!outcome.success) {
    return {};
  }

  return outcome.data;
}

/** Wraps a response, parsing the body only when the status indicates success. */
export async function resultOf<T>(
  response: APIResponse,
  schema: ZodType<T>,
): Promise<ApiResult<T>> {
  const status = response.status();
  const rawBody = await response.text();

  // Parsed only on success. Parsing an error body as the success type fails for the
  // wrong reason and buries the real status code.
  let body: T | undefined;
  if (status >= 200 && status < 300 && rawBody.trim() !== '') {
    body = parseOrThrow(schema, rawBody);
  }

  return { status, body, rawBody, headers: lowercasedHeaders(response) };
}

/** Wraps a response with no body worth parsing, such as a 204 or a status probe. */
export async function statusOnly(response: APIResponse): Promise<ApiResult<never>> {
  const rawBody = await response.text();

  return {
    status: response.status(),
    body: undefined,
    rawBody,
    headers: lowercasedHeaders(response),
  };
}

/**
 * Parses a successful body, or throws with the schema named and the body redacted.
 *
 * A Zod parse failure on a 2xx is a **real defect** and must not be swallowed. The
 * throw is wrapped rather than re-raised raw for one reason: a `ZodError` quotes
 * the values it received, and the body most likely to fail parsing is a login
 * response. So the message carries `redaction.body(...)` of a truncated copy,
 * never the raw text, and names the schema so the reader knows which shape
 * drifted.
 *
 * The schema is named from its Zod `description`, which every schema `resultOf`
 * is called with sets. The fallback phrase exists so a future caller that forgets
 * still gets a readable message rather than `undefined`.
 */
function parseOrThrow<T>(schema: ZodType<T>, rawBody: string): T {
  const parsed: unknown = JSON.parse(rawBody);
  const outcome = schema.safeParse(parsed);
  if (outcome.success) {
    return outcome.data;
  }

  const schemaName = nameOf(schema.description);
  const safeBody = redaction.body(truncate(rawBody));

  testLog.warn(`A successful response did not match ${schemaName}. Body: ${safeBody}`);

  throw new Error(
    `A successful response did not match ${schemaName}, which is a defect rather than ` +
      `a test failure: either the API changed or the model is wrong. ` +
      `Redacted body: ${safeBody}`,
    { cause: outcome.error },
  );
}

function nameOf(description: string | undefined): string {
  if (description === undefined || description.trim() === '') {
    return 'the expected schema';
  }

  return description;
}

function lowercasedHeaders(response: APIResponse): Record<string, string> {
  const flattened: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers())) {
    flattened[name.toLowerCase()] = value;
  }

  return flattened;
}

function truncate(body: string): string {
  if (body.length <= MAX_BODY_CHARACTERS) {
    return body;
  }

  return body.slice(0, MAX_BODY_CHARACTERS) + TRUNCATION_NOTICE;
}
