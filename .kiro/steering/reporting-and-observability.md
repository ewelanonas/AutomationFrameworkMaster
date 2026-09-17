---
inclusion: auto
name: reporting-and-observability
description: Conventions for test reporting, logging, failure artifacts, and traceability — Allure and JUnit XML output, structured logs, correlation ids, screenshots and traces, redaction before publishing, and metrics to track. Use when working on reporters, loggers, test listeners or hooks, failure artifact capture, or when asked to improve test result visibility.
---

# Reporting and Observability

## Two outputs, always

1. **JUnit XML** — machine-readable, consumed by CI to annotate the PR. Same
   schema from all four modules so one tool parses everything.
2. **Allure** — human-readable, with steps, attachments, history, and
   categorisation. Same format from all four modules so one site covers the
   repo.

Both are produced by every suite in every run, including local runs. A run
whose only output is console text cannot be triaged by anyone else.

## What a report entry must contain

For every test, pass or fail:

- Full test name and the suite/tag it ran under.
- Environment name and the resolved base URLs.
- Run id and per-test correlation id.
- Duration, and the worker/shard it ran on.
- Requirement or ticket reference (Allure `@Issue`/`@TmsLink`, JUnit property,
  or an annotation).
- Named steps for each logical phase.

For every failure, additionally:

- The assertion message with expected vs actual, formatted so a reader does not
  need the code.
- The last action attempted and the resolved locator or request URL.
- UI: screenshot, page HTML, video, Playwright trace, browser console errors,
  failed network requests.
- API: method, URL, redacted request headers and body, status, response
  headers and body, elapsed time.
- Container/service logs when a Testcontainer was involved.

## Steps and structure

Wrap logical phases in the framework's step mechanism:

- C#: `AllureApi.Step("...", () => ...)`
- Java: `Allure.step("...", () -> ...)` or `@Step` on flow methods
- Python: `with allure.step("...")` or `@allure.step`
- TypeScript: `test.step("...", async () => ...)`

Put `@Step`/`test.step` on **flow** methods, not on every page-object call.
The report should read like the scenario, not like a DOM log.

## Categorisation

Configure Allure categories so failures self-sort:

- **Product defect** — assertion failures.
- **Test defect** — locator not found, null reference, schema parse error.
- **Environment** — connection refused, DNS, 502/503, container startup.
- **Flake** — passed on retry.
- **Skipped/quarantined** — with owner and ticket.

This split is what turns 40 red tests into "one environment outage" in ten
seconds instead of an hour.

## Structured logging

- One logger per test with the test name and correlation id in context
  (MDC in Java, `ILogger` scope in .NET, `logging` adapter/`contextvars` in
  Python, a per-test logger in TS). Parallel runs must never interleave into an
  unreadable stream.
- Log at INFO: navigation, business action, request line, response status.
  DEBUG: locator resolution, payloads. Never log at INFO what you would not
  want in a report.
- Structured (key-value or JSON) output in CI, human-friendly locally.
- No `System.out.println`, `print`, `Console.WriteLine`, or `console.log`.

## Redaction before output

Every log line, attachment, and report field passes through the redaction
helper in `support/` before it is written. Redact by key name and by pattern,
replacing with `***REDACTED***`.

Specific traps:

- `Authorization` headers, cookies, and `Set-Cookie`.
- Tokens in URLs (`?access_token=`), which also land in traces and HAR files.
- Playwright traces and videos capture real headers and screen content. Treat
  them as sensitive artifacts: short retention, restricted access, and never
  attach a HAR without scrubbing.
- Request bodies containing PII. Redact fields, do not truncate and hope.
- Never log the presence, length, or prefix of a secret.

## Artifact hygiene

- Failure-only retention for traces, videos, and screenshots. Always-on
  capture will fill storage and slow the suite.
- Deterministic artifact paths: `reports/<module>/<suite>/<test-id>/...` so a
  merge step across shards cannot collide.
- Clean `reports/` at the start of a run; never commit it.
- Attach artifacts to the report rather than telling the reader to dig through
  a zip.

## Traceability

- Every test links to a requirement, user story, or defect id. A test with no
  linked reason is a test nobody can prioritise.
- Keep the mapping in the test annotation, not in a separate spreadsheet.
- Generate a coverage-by-requirement view from the report metadata, and use
  gaps in it to drive new tests.

## Metrics worth publishing

Per run: total, passed, failed, skipped, flaky, duration p50/p95, slowest 10
tests, first-attempt pass rate.

Trended over 30 days: first-attempt pass rate, flake rate, suite duration,
top failing tests, quarantine count and age, and time-to-triage on nightly
failures.

Publish these where the team already looks. A dashboard nobody opens is not
observability.

## Anti-patterns

- Console output as the only report.
- Screenshots saved to disk but not attached to the report.
- A single giant log file for a parallel run.
- Uploading traces for passing tests.
- Reports that show "assertion failed" with no expected/actual.
- Publishing a HAR or trace with live tokens in it.
- Test names like `test_1`, `Test_Login_2` that mean nothing in a report.
- Separate report formats per module, so nobody can see the whole picture.
