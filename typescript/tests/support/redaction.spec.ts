/**
 * The redaction choke point, checked without touching the network.
 *
 * Four cases, matching `python/tests/support/test_redaction.py`: the four patterns
 * and the field pass are what stand between a token and a CI log that outlives the
 * run and is readable by more people than the test author expects.
 *
 * Two of the cases carry an extra expectation that is specific to TypeScript. The
 * other three modules override `ToString()` / `__str__` on every credential-bearing
 * shape; a Zod-inferred type is a plain object and Playwright's `expect` formatter
 * honours neither `toString()` nor `util.inspect.custom`, so there is no override
 * that reliably reaches the report. That makes `JSON.stringify` of a response body
 * the realistic leak path, which is why it is asserted here rather than assumed.
 */

import { expect, test } from '@playwright/test';

import * as redaction from '@support/redaction';

// Obviously fake, and shaped only so the JWT pattern has something to match.
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.ZmFrZS1zaWduYXR1cmU';

test.describe('Redaction', () => {
  test('replaces a JWT in free text with the marker', { tag: ['@smoke'] }, () => {
    const line = `GET /products?access_token=${FAKE_JWT} returned 200`;

    const safe = redaction.text(line);

    expect(safe, 'a token in a URL query string is still a token').not.toContain(FAKE_JWT);
    expect(safe, 'the marker is fixed and never partially reveals a value').toContain(
      redaction.MARKER,
    );

    // The realistic leak path in this module: a response body being attached.
    const loginResponse = { access_token: FAKE_JWT, token_type: 'bearer', expires_in: 300 };

    const safeBody = redaction.body(JSON.stringify(loginResponse));

    expect(safeBody, 'a stringified login response must not carry the token').not.toContain(
      FAKE_JWT,
    );
    expect(safeBody, 'the body pass redacts the named field as well as the shape').toContain(
      redaction.MARKER,
    );
  });

  test('replaces a bearer value while keeping the scheme', { tag: ['@smoke'] }, () => {
    const headerValue = 'Bearer abcdef1234567890';

    const safe = redaction.header('Authorization', headerValue);

    expect(safe, 'a sensitive header name is redacted whatever its value').toBe(redaction.MARKER);

    const inFreeText = redaction.text(`sent header ${headerValue}`);

    expect(inFreeText, 'the scheme says what kind of credential leaked').toContain('Bearer ');
    expect(inFreeText, 'only the token part is replaced').toContain(redaction.MARKER);
    expect(inFreeText, 'the token itself never survives').not.toContain('abcdef1234567890');
  });

  test('replaces a password field while keeping the key', { tag: ['@smoke'] }, () => {
    const payload = '{"email":"af-run-tag-1@example.invalid","password":"not-a-real-password"}';

    const safe = redaction.body(payload);

    expect(safe, 'the key is kept verbatim so the logged body keeps its shape').toContain(
      '"password"',
    );
    expect(safe, 'the value is replaced').toContain(redaction.MARKER);
    expect(safe, 'the password never survives').not.toContain('not-a-real-password');
    expect(
      safe,
      'email is deliberately not in the field list, so a generated identity stays readable',
    ).toContain('af-run-tag-1@example.invalid');
  });

  test('replaces a card-shaped run of digits', { tag: ['@smoke'] }, () => {
    const safe = redaction.text('card 4111111111111111 declined');

    expect(safe, 'thirteen to nineteen digits is the shape of a card number').not.toContain(
      '4111111111111111',
    );
    expect(safe, 'the marker never reports the length of what it replaced').toContain(
      redaction.MARKER,
    );
  });
});
