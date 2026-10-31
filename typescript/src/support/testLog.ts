/**
 * Structured logging for the suite, with per-test attribution.
 *
 * With parallel execution, lines from several tests interleave into one stream.
 * Without a per-test marker on every line that stream is unreadable exactly when
 * it matters, which is why every line carries the run id and the current test
 * name — the same five fields as Python's `LOG_FORMAT`.
 *
 * Every message passes through `redaction.text` **inside the writer**, not at the
 * call site. One choke point is the only way to be confident nothing slips
 * through. `console.log` is banned by `no-console` and would bypass the writer
 * anyway.
 *
 * **`info` and `warn` only; there is no `debug`.** `test_log.py` has one, but
 * `reporting.configure_logging()` installs its handler at `logging.INFO`, so in
 * the shipped module `debug` produces no output at all. Exporting a `debug` here
 * with no level mechanism would be the one function in this module that behaves
 * differently from its Python namesake, and in the louder direction. Whichever
 * caller first needs it adds it together with the level gate — a module constant
 * and a plain numeric comparison, not a logging framework.
 *
 * **The writer targets `process.stderr`, not `process.stdout`**, matching
 * `FrameworkLogHandler(stream=sys.stderr)`. Not cosmetic: the `list` reporter
 * writes its own progress output to stdout, and interleaving framework log lines
 * with it makes both harder to read and the combined stream harder to pipe.
 *
 * **[runner-is-driver]** The scope mechanism is simpler here than in the other
 * three modules. C# uses `AsyncLocal`, Java uses MDC and Python uses a
 * `ContextVar` plus hooks; a module-level variable is enough here because a
 * Playwright worker is one process running one test at a time, so there is no
 * propagation machinery to look for. A reader coming from `AsyncLocal` or
 * `ContextVar` will look for it, which is why this paragraph exists.
 *
 * The scope is the source of truth where it is set, and `test.info()` is the
 * fallback everywhere else: the only auto fixture in the module is
 * `failureArtifacts`, which sits on the UI suite alone, so the UI cases set an
 * explicit scope and keep their teardown lines attributed while every other case
 * resolves `[test]` from `test.info()`.
 */

import { test } from '@playwright/test';

import * as redaction from './redaction';
import { runId } from './runContext';

// Matches `%(levelname)-5s` in Python's LOG_FORMAT, so four- and seven-character
// level names still line the message column up.
const LEVEL_WIDTH = 5;

let currentTest: string | undefined;

/** Associates subsequent log lines with a test name. */
export function beginScope(testName: string): void {
  currentTest = testName;
}

/** Clears the test scope. A leaked value gets attributed to whichever test runs next. */
export function endScope(): void {
  currentTest = undefined;
}

export function info(message: string): void {
  write('INFO', message);
}

export function warn(message: string): void {
  write('WARN', message);
}

function scopeName(): string {
  if (currentTest !== undefined) {
    return currentTest;
  }

  // The one place in this module where a `try` guards a diagnostic rather than a
  // behaviour. `test.info()` throws outside a running test, and a log line
  // emitted from globalSetup — where no test exists — must say `setup` rather
  // than break the line it was asked to write.
  try {
    return test.info().title;
  } catch {
    return 'setup';
  }
}

function write(level: string, message: string): void {
  // Redacted on the way out, not at every call site.
  const safe = redaction.text(message);
  const timestamp = new Date().toISOString();
  const line = `${timestamp} ${level.padEnd(LEVEL_WIDTH)} [${runId()}] [${scopeName()}] ${safe}\n`;
  process.stderr.write(line);
}
