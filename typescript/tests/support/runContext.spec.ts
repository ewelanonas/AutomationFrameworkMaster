/**
 * The shape of a generated identity, checked without touching the network.
 *
 * These exist because of a CI failure. Two module jobs of one workflow run
 * resolved the same run id from `GITHUB_RUN_ID`, each restarted its own counter
 * at 1, and the second job re-registered the first job's addresses — the API
 * answered `409` and the suites went red with no code change. `processTag()` is
 * the discriminator that fixes it, so it gets checks that do not consult the
 * generator: the format checks below would pass vacuously if the tag were ever
 * empty.
 *
 * The cross-process property cannot be proved from inside one process; the CI
 * run is what covers that. Asserted with `startsWith`/`endsWith`, never by
 * pinning the random part.
 */

import { expect, test } from '@support/fixtures';

import { buildProcessTag, nextCorrelationId, processTag, runId } from '@support/runContext';
import { uniqueEmail, uniqueName } from '@support/testValues';

const RANDOM_FLOOR_CHARACTERS = 8;

test.describe('Run context', () => {
  test('embeds the run id and the process tag in a generated email', { tag: ['@smoke'] }, () => {
    const email = uniqueEmail();

    expect(
      email.startsWith(`af-${runId()}-${processTag()}-`),
      'the af- prefix and the embedded run id are what let a janitor job find leftovers',
    ).toBe(true);
  });

  test('uses a reserved domain for a generated email', { tag: ['@smoke'] }, () => {
    const email = uniqueEmail();

    expect(
      email.endsWith('@example.invalid'),
      'generated addresses must never be able to deliver mail',
    ).toBe(true);
    // An empty process tag would collapse to "af-{runId}--{n}" and would still
    // satisfy a startsWith check built from the same members, so assert the
    // shape directly.
    expect(email, 'an empty segment means a discriminator went missing').not.toContain('--');
  });

  test("keeps the caller's prefix in a generated name", { tag: ['@smoke'] }, () => {
    const name = uniqueName('order');

    expect(
      name.startsWith(`order-af-${runId()}-${processTag()}-`),
      'the prefix says what the record is and the rest says which process made it',
    ).toBe(true);
  });

  test('differs between two generated emails', { tag: ['@smoke'] }, () => {
    const first = uniqueEmail();
    const second = uniqueEmail();

    expect(first, 'the run-scoped counter advances on every call').not.toBe(second);
  });

  test('follows the shared format for a correlation id', { tag: ['@smoke'] }, () => {
    const correlationId = nextCorrelationId();

    expect(
      correlationId.startsWith(`af-${runId()}-${processTag()}-`),
      'a server-side log search on the run id must return every request the suite made',
    ).toBe(true);
    expect(correlationId, 'an empty segment means a discriminator went missing').not.toContain(
      '--',
    );
  });

  test('builds a process tag that is safe in an email local part', { tag: ['@smoke'] }, () => {
    const tag = processTag();

    expect(tag.trim(), 'the tag is what keeps two processes apart').not.toBe('');
    expect(tag.length, 'the random floor is 8 hex characters').toBeGreaterThanOrEqual(
      RANDOM_FLOOR_CHARACTERS,
    );
    expect(tag, 'the tag is minted once per process').toBe(processTag());
    expect(tag, 'only letters, digits and - are safe in an email local part or a path').toMatch(
      /^[a-z0-9-]+$/,
    );

    // The CI branch, through the injected environment: GITHUB_JOB is unset on a
    // developer machine, so every other case here exercises the random-only path
    // and the retained-versus-sliced truncation question stays invisible.
    expect(
      buildProcessTag({ GITHUB_JOB: 'typescript-suite', GITHUB_RUN_ATTEMPT: '2' }),
      'the job key keeps 12 retained characters, matching all three shipped modules',
    ).toMatch(/^typescriptsu-2-[0-9a-f]{8}$/);
  });
});
