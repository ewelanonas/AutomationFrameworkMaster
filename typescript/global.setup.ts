/**
 * Everything that must happen exactly once per run.
 *
 * This is the direct answer to the carried once-per-run defect, and to the general
 * lesson behind it: anything that must happen once per run must not be keyed on
 * something that is stable across runs.
 *
 * Three properties, each stated because each is the thing that broke somewhere
 * else:
 *
 * 1. **It runs exactly once per run, by construction.** `globalSetup` is invoked
 *    by the main process once per `playwright test` invocation. It is not keyed on
 *    a path, a marker file, a lock, or anything derived from a directory that
 *    outlives the run, so nothing in this module ever asks "has this already
 *    happened" — the mechanism makes the question meaningless. Python has to ask
 *    it, because its session fixture runs once *per worker*, and then the marker's
 *    directory has to be chosen carefully: `tmp_path_factory.getbasetemp().parent`
 *    is run-scoped under xdist but machine-scoped without it, and a marker written
 *    to a machine-scoped directory would have stopped run metadata ever being
 *    rewritten after the first plain run on a machine.
 * 2. **Identity is pinned before workers fork.** `pinRunIdForWorkers()` sets
 *    `AF_RUN_ID` and `pinSeedForWorkers()` sets `AF_DATA_SEED`, each only if
 *    absent or blank, each owned by the module that owns the value. Every worker
 *    then re-imports `runContext` and `testValues` and resolves the same run id and
 *    the same seed, because the variables are inherited.
 * 3. **The process tag is deliberately not pinned.** Each worker mints its own 8
 *    hex characters, which is precisely what keeps generated emails unique across
 *    workers while the run id stays traceable — ADR 0006's whole point, and the fix
 *    for the `409` that broke two suites. There is no `AF_PROCESS_TAG` variable and
 *    none is added.
 *
 * Not declared `async`: the body awaits nothing, and
 * `@typescript-eslint/require-await` is an error in this module. Playwright accepts
 * a synchronous `globalSetup`.
 */

import { loadConfig } from '@support/config';
import * as runContext from '@support/runContext';
import * as testLog from '@support/testLog';
import * as testValues from '@support/testValues';

export default function globalSetup(): void {
  // Configuration has already resolved — and already failed, if it was going to —
  // when playwright.config.ts was evaluated at module scope in this same process,
  // before this function was ever called. Called again here only because the cache
  // makes it free and because the dependency is worth stating in the file that
  // other run-level setup lives in. The call stands for its side effect: assigning
  // it to a const nobody reads would be a `tsc --noEmit` failure under
  // noUnusedLocals.
  loadConfig();

  runContext.pinRunIdForWorkers(); // idempotent; the config file already called both
  testValues.pinSeedForWorkers();
  testValues.logSeed();

  testLog.info(
    `Run ${runContext.runId()} starting. processTag=${runContext.processTag()} ` +
      'in the main process; each worker mints its own.',
  );
}
