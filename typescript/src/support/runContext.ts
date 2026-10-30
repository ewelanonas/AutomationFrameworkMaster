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

// Internal plumbing, deliberately not an `AF_<AREA>_<KEY>` config knob: it exists
// only so a forked worker can read back what its main process minted.
const INVOCATION_TAG_VARIABLE = 'AF_INTERNAL_INVOCATION_TAG';

/**
 * The discriminator that keeps two concurrent invocations off each other's
 * output directory.
 *
 * ADR 0006 one layer down. The run id is shared by design — `GITHUB_RUN_ID` is
 * the same for every job of a workflow run, and `AF_RUN_ID` exists so a
 * developer can reuse one deliberately — and the process tag answers that for
 * generated *identities*. It cannot answer it for *paths*, because every worker
 * process mints its own tag while all of them have to agree on one directory.
 *
 * A path keyed only on the run id is unsafe for a different reason than a
 * duplicate email is: Playwright **wipes `outputDir` when a run starts**. Two
 * invocations sharing a run id therefore share a directory that each of them
 * deletes, and the one that started first loses its in-flight trace files
 * mid-run. The symptom is `ENOENT` thrown from `apiRequestContext.dispose`, far
 * from the cause and naming neither concurrency nor the run id, which is the
 * sort of failure automation-principles rule 8 exists to forbid.
 *
 * So this is per *invocation*, not per process: minted once in the main process
 * and pinned into the environment so forked workers inherit it, which is
 * exactly how the run id reaches a worker. It is internal plumbing with no
 * documented variable and no entry in `.env.example` — nobody sets it, and a
 * knob here would only let someone re-break the thing it fixes.
 */
function resolveInvocationTag(): string {
  const inherited = process.env[INVOCATION_TAG_VARIABLE];
  if (inherited !== undefined && inherited.trim() !== '') {
    return inherited.trim();
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
const INVOCATION_TAG: string = resolveInvocationTag();

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

/**
 * Discriminator for this invocation of the suite, shared by its workers and
 * different between two invocations that share a run id.
 *
 * Used to key the output directory and nothing else: it is not part of any
 * generated identity, and no log line, report field or correlation id carries
 * it. See {@link resolveInvocationTag} for why it exists.
 */
export function invocationTag(): string {
  return INVOCATION_TAG;
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
 * Writes a value into the environment so forked worker processes inherit it,
 * leaving an existing value alone.
 *
 * Blank counts as absent, the same rule every other `AF_*` read in this module
 * follows. `??=` would leave `NAME=""` in place, and every resolver here treats
 * blank as absent, so each worker would fall through to its own random hex —
 * the exact scattering these pins exist to prevent.
 *
 * Shared by the two pins below because the mechanism is one mechanism: mint in
 * the main process, pin before any worker is forked, let the worker's own
 * module import read it back.
 */
function pinForWorkers(variable: string, value: string): void {
  const existing = process.env[variable];
  if (existing === undefined || existing.trim() === '') {
    process.env[variable] = value;
  }
}

/**
 * Pins the run id into the environment so every worker process resolves the
 * same one. Pins **only** the run id: the process tag is what keeps identities
 * unique per worker, and ADR 0006 refuses to ship a knob whose only purpose is
 * to re-break that.
 */
export function pinRunIdForWorkers(): void {
  pinForWorkers('AF_RUN_ID', runId());
}

/**
 * Pins this invocation's output-directory discriminator so every worker of this
 * invocation writes under the same directory, while a second invocation sharing
 * the run id gets its own. See {@link resolveInvocationTag}.
 *
 * Must run before anything derives a path from it, which in practice means
 * beside `pinRunIdForWorkers()` at the top of `playwright.config.ts`.
 */
export function pinInvocationTagForWorkers(): void {
  pinForWorkers(INVOCATION_TAG_VARIABLE, invocationTag());
}
