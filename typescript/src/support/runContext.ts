/**
 * Identity for a single execution of the suite.
 *
 * Mirrors the shipped `RunContext.cs`, `RunContext.java` and `run_context.py`
 * step for step. The run id ties together every generated value, every log line
 * and every correlation header from one run: when a test fails in CI and leaves
 * data behind, the run id is what finds both the log and the orphaned record.
 * Set `AF_RUN_ID` to reuse an id, which is useful when re-running a single test
 * against data an earlier run created.
 *
 * The run id is deliberately shared between processes belonging to one pipeline
 * run, so the **process tag** is what keeps a generated identity unique per
 * process. That sharing is what broke the suite once: the Java and C# jobs of
 * one workflow run resolved the same run id, restarted their own counters at 1,
 * and the second job re-registered the first job's email addresses, so the API
 * answered `409`. See ADR 0006.
 *
 * Identity format, identical in all four modules:
 *
 *     email           af-{runId}-{processTag}-{n}@example.invalid
 *     name            {prefix}-af-{runId}-{processTag}-{n}
 *     correlation id  af-{runId}-{processTag}-{n}
 *
 *     in CI           af-37529901169-typescriptsu-1-9f3c1a7e-5@example.invalid
 *     locally         af-4b1e9c70-9f3c1a7e-5@example.invalid
 */

import { randomUUID } from 'node:crypto';

function shortRandomHex(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8);
}

/**
 * Lowercase letters and digits only, so a tag is safe in an email local part
 * and in a path.
 *
 * The loop breaks on the length of the **retained** buffer, tested before the
 * filter — exactly as `RunContext.cs`, `RunContext.java` and `run_context.py`
 * write it. The difference is not academic: for `GITHUB_JOB=typescript-suite`
 * the retained reading gives `typescriptsu`, while slicing the input to 12 and
 * filtering afterwards gives `typescripts`, so two modules in one workflow run
 * would mint different tags from the same job key.
 *
 * The three shipped modules use `char.IsLetterOrDigit`, `Character.isLetterOrDigit`
 * and `str.isalnum()`, all Unicode-aware. `/[a-z0-9]/` after lowercasing is
 * deliberately narrower: a GitHub job key is ASCII by construction, and a
 * Unicode-aware JavaScript test needs `/\p{L}|\p{N}/u`, which would admit
 * characters that are not safe in an email local part — the very thing this
 * function exists to prevent.
 */
export function safeTagPart(value: string | undefined, maxLength: number): string {
  if (value === undefined || value.trim() === '') {
    return '';
  }

  let safe = '';
  for (const character of value.toLowerCase()) {
    if (safe.length === maxLength) {
      break;
    }
    if (/[a-z0-9]/.test(character)) {
      safe += character;
    }
  }

  return safe;
}

function resolveRunId(): string {
  const fromEnvironment = process.env.AF_RUN_ID;
  if (fromEnvironment !== undefined && fromEnvironment.trim() !== '') {
    return fromEnvironment.trim();
  }

  // A CI build number makes a run traceable back to the pipeline that produced it.
  const ciRun = process.env.GITHUB_RUN_ID;
  if (ciRun !== undefined && ciRun.trim() !== '') {
    return ciRun.trim();
  }

  return shortRandomHex();
}

/**
 * The CI per-job key and attempt number when present, followed by random hex.
 *
 * Random alone is only probabilistically unique. Where the CI provider hands us
 * a key that is unique by construction within one run — the job key, plus the
 * attempt number, which is what distinguishes a re-run since `GITHUB_RUN_ID` is
 * preserved across attempts — that key is folded in, so the two processes that
 * actually collided cannot collide again. The random part is always present: it
 * is what separates two local processes, two hosts inside one job, and two legs
 * of a matrix job, since the job key carries no matrix values.
 *
 * The environment is a parameter, not a global read, so the CI-only branch is
 * covered by a test that runs locally — `GITHUB_JOB` is unset on a developer
 * machine. The module calls it exactly once, at import.
 */
export function buildProcessTag(env: NodeJS.ProcessEnv): string {
  const randomPart = shortRandomHex();

  const jobPart = safeTagPart(env.GITHUB_JOB, 12);
  if (jobPart === '') {
    return randomPart;
  }

  let attemptPart = safeTagPart(env.GITHUB_RUN_ATTEMPT, 2);
  if (attemptPart === '') {
    attemptPart = '1';
  }

  return `${jobPart}-${attemptPart}-${randomPart}`;
}

const RUN_ID: string = resolveRunId();
const PROCESS_TAG: string = buildProcessTag(process.env);

// Node runs one JavaScript thread per worker process, so no lock is needed and
// none is added. A reader coming from `Interlocked.Increment` or a
// `threading.Lock` will look for one.
let sequence = 0;

/** Short, lowercase, filename-safe identifier for this run. */
export function runId(): string {
  return RUN_ID;
}

/**
 * Discriminator for this process, minted once. Makes generated identities unique
 * between two processes that share a run id.
 */
export function processTag(): string {
  return PROCESS_TAG;
}

/** Next value in the process-scoped sequence. Keeps generated data unique. */
export function nextSequence(): number {
  sequence += 1;
  return sequence;
}

/**
 * Next correlation id for an outbound request, formatted
 * `af-{runId}-{processTag}-{n}` so a server-side log search on the run id
 * returns every request the suite made.
 */
export function nextCorrelationId(): string {
  // String(...) because ts.configs.strictTypeChecked turns on
  // restrict-template-expressions with allowNumber: false, so a number in a
  // template literal is a lint error across this module.
  return `af-${RUN_ID}-${PROCESS_TAG}-${String(nextSequence())}`;
}

/**
 * Pins the run id into the environment so every worker process resolves the
 * same one. Pins **only** the run id: the process tag is what keeps identities
 * unique per worker, and ADR 0006 refuses to ship a knob whose only purpose is
 * to re-break that.
 */
export function pinRunIdForWorkers(): void {
  // Blank counts as absent, the same rule every other AF_* read follows.
  // `??=` would leave AF_RUN_ID="" in place, and runId() treats blank as absent,
  // so every worker would fall through to its own random hex — the exact
  // scattering this pin exists to prevent.
  const existing = process.env.AF_RUN_ID;
  if (existing === undefined || existing.trim() === '') {
    process.env.AF_RUN_ID = runId();
  }
}
