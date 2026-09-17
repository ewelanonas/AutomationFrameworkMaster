# 0003 — Plain `HttpClient` rather than Refit for API clients

- **Status:** Accepted
- **Date:** 2026-09-17
- **Applies to:** the `csharp/` module

## Context

`tech.md` originally specified `HttpClient` + **Refit** for C# API clients.

Refit generates a typed client from an interface, which removes real boilerplate
in an application that *consumes* an API. A test client has different
requirements from a consumer.

## Decision

Use `HttpClient` directly, with `System.Text.Json`, wrapped in the module's own
`ApiResult<T>`.

## Reasoning

**A test client needs the raw status and body on every call.** The house rules
require that clients never throw on a non-2xx, so a 403 test and a 200 test read
identically. With Refit that means `ApiResponse<T>` everywhere plus
`Task<ApiResponse<T>>` signatures — the interface stops being a clean contract
and becomes a wrapper around a wrapper.

**Negative tests deliberately send malformed payloads.** Refit's strength is that
the interface constrains what you can send. That is precisely what a test needs to
violate: a login with the `password` key absent entirely, an oversized field, a
wrong type. Working around the generated client to send an invalid request is
harder than building the request.

**One fewer moving part in the diagnostic path.** All logging, redaction and
correlation-id injection lives in a single `DelegatingHandler`. That works
identically either way, but with plain `HttpClient` the call path from test to
socket is four types with no source generation in between — which matters when
someone is debugging why a request looked different from what they expected.

**Readability.** The house style asks for code a Java or Python engineer can read
on the first pass. `await http.GetAsync($"products/{id}")` needs no explanation.
A source-generated interface implementation does.

## Consequences

- Slightly more code per client method: build the request, send, wrap. Around
  three lines.
- Query and path values are escaped explicitly with `Uri.EscapeDataString`. Refit
  would have handled that; forgetting it is now a review item, and it is called
  out in `csharp-testing.md`.
- No `Refit` dependency.

## Alternatives considered

- **Refit with `ApiResponse<T>` throughout.** Workable. Rejected as above: the
  indirection costs more than the boilerplate it saves at this scale, and the
  negative-path ergonomics are worse.
- **Generate a client from the OpenAPI spec** (NSwag, Kiota). Attractive once
  `shared/contracts/` holds a full, authoritative spec. Today those schemas were
  derived from live responses and cover four shapes, so generation would produce
  less than it costs. Worth revisiting when the contracts are complete and
  publisher-maintained.

## Note on parity

The Java module uses REST Assured, which is a test-first HTTP library rather than
a consumer-first one, so this is not a divergence in intent. Both modules end up
with the same shape: a client that returns status plus a typed body and throws on
nothing.
