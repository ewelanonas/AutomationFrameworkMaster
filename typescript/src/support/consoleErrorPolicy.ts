/**
 * Separates console errors worth failing a test for from known, accepted noise.
 *
 * A page that renders correctly while throwing in the console is a real defect
 * that functional assertions never notice, so the check is worth having. But a
 * blanket "no console errors" assertion against an application with third-party
 * scripts fails constantly and gets deleted within a week, taking the useful part
 * of the check with it.
 *
 * The middle ground is a reviewed allowlist. Every entry needs a reason; an entry
 * with no reason is how a real defect gets silently accepted.
 *
 * **`significant` receives ERROR-LEVEL MESSAGES ONLY.** Severity filtering happens
 * at collection time, in `recordConsoleMessage` in the `page` override in
 * `fixtures.ts`, which pushes a message only when `message.type() === 'error'` —
 * the same place all three shipped modules filter. So this allowlist is about
 * *which errors are acceptable*, never about filtering severity. If `log`, `info`
 * or `warning` output ever reaches here, the honest fix is the handler, not a new
 * allowlist entry.
 *
 * Byte-identical to `console_error_policy.py` and `ConsoleErrorPolicy.cs`,
 * including the per-entry reasons:
 *
 * `status of 401`
 *     The browser's own message for the failed request. The catalogue page fires
 *     an authenticated call while signed out, on **every** anonymous page load,
 *     and logs the resulting 401. It is the application's own behaviour, not
 *     something the suite introduced, and the page still renders.
 *
 * `error {message: unauthorized}`
 *     The application's own handler logging that same 401. Matched as the exact
 *     observed string rather than on the word "unauthorized" alone, so a genuine
 *     authorization defect logged in different words is still reported.
 *     Server-side authorization is covered directly by the API tests, which
 *     assert 401 themselves.
 *
 * `favicon`
 *     A missing icon is not a functional failure.
 *
 * `err_blocked_by_client` / `net::err_blocked`
 *     A local ad or tracker blocker cancelling a third-party request. Depends on
 *     the developer's browser profile, not on the application.
 *
 * `third-party cookie`
 *     A browser deprecation notice about a third-party script, not application
 *     behaviour.
 *
 * When an entry here starts hiding something real, delete it and fix the cause. Do
 * not add an entry to make a red test green without understanding what produced it.
 */

// Stored lowercase; the incoming message is lowercased before matching.
const ACCEPTED_NOISE: readonly string[] = [
  'status of 401',
  'error {message: unauthorized}',
  'favicon',
  'err_blocked_by_client',
  'net::err_blocked',
  'third-party cookie',
];

/**
 * Returns only the console errors that should fail a test.
 *
 * A plain loop with an early `continue` rather than a `filter` with a helper
 * predicate: this is the function someone reads while a test is failing on console
 * noise, and all three shipped modules use the loop.
 */
export function significant(allErrors: readonly string[]): string[] {
  const result: string[] = [];

  for (const error of allErrors) {
    if (isAcceptedNoise(error)) {
      continue;
    }
    result.push(error);
  }

  return result;
}

/**
 * Substring match, case-insensitive. A blank message counts as accepted noise.
 *
 * Playwright occasionally reports an error event with no text, and a test failing
 * with "unexpected console error: ''" tells the reader nothing at all.
 *
 * Substring matching is this module's rule and only this module's rule;
 * `redaction` matches names by equality.
 */
function isAcceptedNoise(error: string): boolean {
  if (error.trim() === '') {
    return true;
  }

  const lowered = error.toLowerCase();

  for (const accepted of ACCEPTED_NOISE) {
    if (lowered.includes(accepted)) {
      return true;
    }
  }

  return false;
}
