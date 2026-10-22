/**
 * The named guard for a value a test is about to dereference.
 *
 * It exists to reconcile three gates that would otherwise conflict:
 * `noUncheckedIndexedAccess` types `names[0]` as `string | undefined`, so every
 * indexed read needs a guard; `@typescript-eslint/no-non-null-assertion` bans
 * `!`; and `playwright/no-conditional-in-test` reports the `if` that a guard
 * would be, inside a test body. A module-level function is outside that rule's
 * scope, so moving the guard here satisfies all three at once.
 *
 * `null` is accepted as well as `undefined` because the models declare the
 * optional catalogue fields with `.nullish()`, which Zod infers as
 * `T | null | undefined`. A guard that removed only `undefined` would hand back
 * `Category | null` and the next dereference would be a `strict` compile error.
 */
export function requireValue<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) {
    // The wording carries the distinction that matters when a test fails: page 1
    // of the catalogue coming back empty is the arrangement failing, not the
    // product under test misbehaving.
    throw new Error(`${what} was missing. This is a setup failure, not an assertion failure.`);
  }

  return value;
}
