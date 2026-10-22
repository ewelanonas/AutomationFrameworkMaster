/**
 * The timeout-override rules, checked hermetically.
 *
 * All three cases call `resolveConfig(syntheticEnv, sources)` and **never** mutate
 * `process.env`, which is what makes them safe under parallel workers — a
 * deliberate improvement on Python, whose three config tests patch `os.environ`
 * and call `cache_clear()`.
 *
 * **All three pass both `ConfigSources` members**, not only case 3. Cases 1 and 2
 * assert a throw, which makes it tempting to omit the sources on the grounds that
 * resolution never gets that far. It does get that far: the descriptor is read on
 * the way to the timeout parse, so an omitted `environmentsDir` would resolve
 * `shared/environments/local.json`, a file four modules share, and an omitted
 * `dotEnv` would read whatever untracked repo-root `.env` the developer owns. A
 * test that throws for the right reason while reading the wrong file is a test
 * that will one day throw for the wrong reason.
 *
 * `import.meta.dirname` resolves to this spec's own directory under Playwright's
 * TypeScript transform — confirmed while the probe harness existed, so the
 * `repoPaths.repoRoot()`-anchored form of this path is not needed.
 */

import path from 'node:path';

import { expect, test } from '@playwright/test';

import { resolveConfig, type ConfigSources } from '@support/config';

const FIXTURE_SOURCES: ConfigSources = {
  environmentsDir: path.join(import.meta.dirname, 'fixtures', 'environments'),
  dotEnv: {},
};

const DESCRIPTOR_ELEMENT_MS = 7000;

test.describe('Configuration', () => {
  test('rejects a non-integer timeout override', { tag: ['@smoke'] }, () => {
    function resolveWithBadOverride(): void {
      resolveConfig({ AF_ENV: 'review-fixture', AF_TIMEOUTS_ELEMENTMS: 'abc' }, FIXTURE_SOURCES);
    }

    expect(
      resolveWithBadOverride,
      'someone setting this variable is changing the waiting policy, so a typo must not be ignored',
    ).toThrow("AF_TIMEOUTS_ELEMENTMS must be a whole number of milliseconds, but was 'abc'.");
  });

  test('rejects a timeout override outside the accepted range', { tag: ['@smoke'] }, () => {
    function resolveWithOutOfRangeOverride(): void {
      resolveConfig({ AF_ENV: 'review-fixture', AF_TIMEOUTS_ELEMENTMS: '10' }, FIXTURE_SOURCES);
    }

    expect(
      resolveWithOutOfRangeOverride,
      'the lower bound catches seconds written where milliseconds belong',
    ).toThrow('AF_TIMEOUTS_ELEMENTMS must be between 1000 and 600000 milliseconds, but was 10.');
  });

  test('falls through to the descriptor when no override is set', { tag: ['@smoke'] }, () => {
    const config = resolveConfig({ AF_ENV: 'review-fixture' }, FIXTURE_SOURCES);

    // 7000 is a value no real environment uses, so the number in this assertion
    // can only have come from the fixture descriptor.
    expect(config.timeouts.elementMs, 'with no override, the descriptor value wins').toBe(
      DESCRIPTOR_ELEMENT_MS,
    );
  });
});
