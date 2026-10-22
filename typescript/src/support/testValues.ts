/**
 * Generated values that are unique per run and reproducible on demand.
 *
 * Mirrors `TestValues.cs`, `TestValues.java` and `test_values.py`. The generator
 * is seeded and the seed is reported; without that, a failure caused by one
 * particular generated value can never be reproduced — you get a red test, a
 * re-run that passes, and no explanation. Set `AF_DATA_SEED` to the reported
 * value to replay a run's data exactly.
 *
 * Generated identities use reserved test domains only. A real domain in test
 * data eventually means real email sent to a real person.
 *
 * Resolution happens once, at import, into a module constant — matching
 * `_SEED` in `test_values.py`. Nothing in this module logs at import time.
 */

import { randomInt } from 'node:crypto';

import { Faker, en } from '@faker-js/faker';

import { nextSequence, processTag, runId } from './runContext';

/**
 * `AF_DATA_SEED` when set, otherwise a fresh random one.
 *
 * A fixed default would be *worse* than random: it would hide the whole class of
 * bug where a test passes only for one particular generated value.
 */
function resolveSeed(): number {
  const fromEnvironment = process.env.AF_DATA_SEED;
  if (fromEnvironment === undefined || fromEnvironment.trim() === '') {
    return randomInt(2 ** 31);
  }

  const trimmed = fromEnvironment.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`AF_DATA_SEED must be a whole number, but was '${fromEnvironment}'.`);
  }

  return Number.parseInt(trimmed, 10);
}

const SEED: number = resolveSeed();

// One instance per process, seeded once. A Playwright worker is single-threaded,
// so the ThreadLocal / threading.local machinery the other three modules need has
// no counterpart here and none is added.
const FAKER: Faker = new Faker({ locale: en });
FAKER.seed(SEED);

/** The seed this run is using. Written to the Allure environment block as `dataSeed`. */
export function seed(): number {
  return SEED;
}

/**
 * Pins this process's already-resolved seed into the environment so every worker
 * resolves the same number the main process reported.
 */
export function pinSeedForWorkers(): void {
  // Same blank-is-absent rule as pinRunIdForWorkers and every other AF_* read.
  // `??=` would leave AF_DATA_SEED="" in place and each worker would then resolve
  // its own random seed, making the one reported number wrong for every worker
  // but the first.
  const existing = process.env.AF_DATA_SEED;
  if (existing === undefined || existing.trim() === '') {
    process.env.AF_DATA_SEED = String(SEED);
  }
}

/** Generator for this process, seeded so data is reproducible. */
export function faker(): Faker {
  return FAKER;
}

/** Unique, run-scoped email on a reserved domain that cannot deliver mail. */
export function uniqueEmail(): string {
  // String(...) because strictTypeChecked's restrict-template-expressions
  // rejects a number in a template literal; see nextCorrelationId.
  return `af-${runId()}-${processTag()}-${String(nextSequence())}@example.invalid`;
}

/** Unique, run-scoped name prefixed so a janitor job can find leftovers. */
export function uniqueName(prefix: string): string {
  return `${prefix}-af-${runId()}-${processTag()}-${String(nextSequence())}`;
}

/**
 * An id that is syntactically valid for the target API but certain not to exist.
 *
 * Shaped as a 26-character ULID because the demo API rejects anything else
 * before it gets as far as looking the record up, which would test the wrong
 * thing. A 404 test has to send an id the service accepts as well formed.
 */
export function wellFormedButMissingId(): string {
  return '0AF00000000000000000000000';
}

/**
 * A reserved, non-dialable run of zeros. Never a real number.
 *
 * The other modules write this literal inline in their account flow; it lives
 * here so the two rules governing it — reserved range, never a real number —
 * sit next to the email rule they belong with.
 */
export function reservedPhoneNumber(): string {
  return '0000000000';
}
