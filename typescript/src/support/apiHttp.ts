/**
 * The one place every API call is logged and attached. The choke point.
 *
 * **[runner-is-driver]** `APIRequestContext` has no interceptor, handler or event
 * hook — there is no equivalent of C#'s `DelegatingHandler`, Java's REST Assured
 * filter or httpx's `event_hooks`. So the choke point has to be a wrapper the
 * clients call instead of the raw context, and the only thing keeping it a choke
 * point is that nothing else holds the context: the `apiHttp` fixture builds the
 * context, wraps it here, and hands out the wrapper.
 *
 * `get` and `post` **only**. Nothing in the 48-case inventory issues a `DELETE`,
 * and `disposableAccount` has no teardown because the demo API offers no
 * self-delete. A `delete` method would be dead surface; whichever test first
 * needs a verb adds it in the same PR, which is when its shape can be checked
 * against a real call rather than guessed.
 *
 * THE BODY IS READ TWICE, AND THAT IS THE CONTRACT
 * -----------------------------------------------
 * This class reads the body for the response attachment; `resultOf` reads it
 * again for `rawBody`, because `get`/`post` hand back the `APIResponse` object
 * rather than the text. Playwright buffers the response body, so both reads
 * return the same string and neither re-fetches. The one consequence that must
 * not be forgotten: **this class never calls `response.dispose()`.**
 *
 * `ignoreHTTPSErrors` is not set. Retries are transport level only and are
 * whatever `APIRequestContext` does natively; no 4xx and no 5xx is ever retried,
 * matching all three shipped modules. No HAR is recorded — HARs capture headers.
 */

import { test } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';

import * as redaction from './redaction';
import * as runContext from './runContext';
import * as testLog from './testLog';

const MAX_BODY_CHARACTERS = 20_000;
const CORRELATION_HEADER = 'X-Correlation-Id';
const TRUNCATION_NOTICE = '\n... truncated for the report ...';

/**
 * Options for one request.
 *
 * Written out rather than described, because `params`' value type is the
 * non-obvious part and three files pass this object.
 */
export interface RequestOptions {
  readonly params?: Record<string, string | number | boolean>;
  readonly data?: unknown;
  readonly headers?: Record<string, string>;
}

/** One HTTP verb, so the log line and the attachment cannot disagree about it. */
type HttpMethod = 'GET' | 'POST';

export class ApiHttp {
  constructor(private readonly request: APIRequestContext) {}

  /** `GET <path>`, relative to the context's base URL. Never throws on a status. */
  async get(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('GET', path, options);
  }

  /** `POST <path>`, relative to the context's base URL. Never throws on a status. */
  async post(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('POST', path, options);
  }

  private async send(
    method: HttpMethod,
    path: string,
    options?: RequestOptions,
  ): Promise<APIResponse> {
    const correlationId = runContext.nextCorrelationId();

    // The correlation id is minted per request and carries a sequence number, so it
    // belongs here and NOT in the context's `extraHTTPHeaders`: a context-level
    // header would make every request in a test share one id and break the
    // `af-{runId}-{processTag}-{n}` contract. Design §17.1 row 4.
    const headers: Record<string, string> = {
      ...(options?.headers !== undefined ? options.headers : {}),
      [CORRELATION_HEADER]: correlationId,
    };

    // Conditional spread, never `params: options?.params`. `exactOptionalPropertyTypes`
    // rejects assigning a possibly-undefined value to an optional member, and an
    // explicit `undefined` is a different request from an absent key anyway.
    const requestOptions = {
      headers,
      ...(options?.params !== undefined ? { params: options.params } : {}),
      ...(options?.data !== undefined ? { data: options.data } : {}),
    };

    const startedAt = performance.now();
    const response = await this.sendThrough(method, path, requestOptions);
    const elapsedMs = Math.round(performance.now() - startedAt);

    // The resolved absolute URL, including the encoded query string. Taken off the
    // response rather than rebuilt from `path`, because the base URL lives on the
    // context and the join is Playwright's to perform.
    const url = response.url();
    const requestBody = bodyTextOf(options?.data);

    await test.info().attach(`API request ${correlationId}`, {
      body: describeRequest(method, url, correlationId, headers, requestBody),
      contentType: 'text/plain',
    });

    const responseBody = await response.text();

    testLog.info(
      `${method} ${url} -> ${String(response.status())} in ${String(elapsedMs)}ms ` +
        `[${correlationId}]`,
    );

    await test.info().attach(`API response ${correlationId}`, {
      body: describeResponse(response, correlationId, elapsedMs, responseBody),
      contentType: 'text/plain',
    });

    return response;
  }

  private async sendThrough(
    method: HttpMethod,
    path: string,
    requestOptions: RequestOptions,
  ): Promise<APIResponse> {
    if (method === 'GET') {
      return this.request.get(path, requestOptions);
    }

    return this.request.post(path, requestOptions);
  }
}

/**
 * The request block, matching `api_http.py`'s `_describe_request`.
 *
 * `--- body ---` appears **only when the request carries content**, which is the
 * one way this block differs from the response block beyond its field list. A
 * `GET` attachment therefore ends after the header block, exactly as it does in
 * Python — writing the marker with nothing under it would give the four modules
 * attachments that no longer diff, which is the only reason these blocks are
 * spelled out at all.
 */
function describeRequest(
  method: HttpMethod,
  url: string,
  correlationId: string,
  headers: Record<string, string>,
  body: string | undefined,
): string {
  const lines: string[] = [
    `${method} ${url}`,
    `correlationId: ${correlationId}`,
    '--- headers ---',
  ];
  for (const line of describeHeaders(headers)) {
    lines.push(line);
  }

  if (body !== undefined) {
    lines.push('--- body ---');
    lines.push(redaction.body(truncate(body)));
  }

  return lines.join('\n');
}

/** The response block, matching `_describe_response`. `--- body ---` is unconditional. */
function describeResponse(
  response: APIResponse,
  correlationId: string,
  elapsedMs: number,
  body: string,
): string {
  const lines: string[] = [
    `status: ${String(response.status())} ${response.statusText()}`,
    `elapsedMs: ${String(elapsedMs)}`,
    `correlationId: ${correlationId}`,
    '--- headers ---',
  ];
  for (const line of describeHeaders(response.headers())) {
    lines.push(line);
  }

  lines.push('--- body ---');
  lines.push(redaction.body(truncate(body)));

  return lines.join('\n');
}

/**
 * Every header value passed through redaction **by name**.
 *
 * A header block is never written verbatim: that is the whole point of having one
 * choke point.
 */
function describeHeaders(headers: Record<string, string>): string[] {
  const described: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    described.push(`${name}: ${redaction.header(name, value)}`);
  }

  return described;
}

/**
 * The request body as text, or `undefined` when the request carries no content.
 *
 * `undefined` is what suppresses the `--- body ---` marker, so "no content" and
 * "empty content" are deliberately the same thing here, matching
 * `_body_text_of`'s zero-length check.
 */
function bodyTextOf(data: unknown): string | undefined {
  if (data === undefined) {
    return undefined;
  }

  if (typeof data === 'string') {
    return data;
  }

  return JSON.stringify(data);
}

function truncate(body: string): string {
  if (body.length <= MAX_BODY_CHARACTERS) {
    return body;
  }

  return body.slice(0, MAX_BODY_CHARACTERS) + TRUNCATION_NOTICE;
}
