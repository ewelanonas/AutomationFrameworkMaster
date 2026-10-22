/**
 * The single place every log line and report attachment passes through.
 *
 * This exists because a trace, an Allure attachment and a CI log all outlive the
 * run and are readable by more people than the test author expects. A token that
 * reaches any of them cannot be un-leaked.
 *
 * Three properties are non-negotiable:
 *
 * 1. Redaction replaces with the fixed marker {@link MARKER}.
 * 2. It never partially reveals a value.
 * 3. It never reports a secret's length.
 *
 * A straight port of `redaction.py`, itself a port of `Redaction.cs` /
 * `Redaction.java`: the same marker, the same five header names, the same
 * nineteen field names, the same four patterns and the same two-pass `body`.
 *
 * **The return contract differs from Python's, deliberately.** `redaction.py`
 * returns `str | None` and passes `None`/`""` straight through, leaving each
 * caller to substitute `""`. The three string-producing functions here promise a
 * `string`, so that substitution moves inside: `undefined` and `''` both return
 * `''`. Redaction never invents text, never emits the literal `undefined` and
 * never emits a placeholder for "there was nothing here" — an attachment reading
 * `--- body ---` followed by nothing is accurate, and one reading `undefined` is
 * a bug report filed against the wrong component. A non-empty value always comes
 * back non-empty: either itself or the marker.
 *
 * **Name matching is equality after lowercasing, not substring.** `access_token`
 * is redacted because it is a listed name; `password_hint` is not, because it is
 * not. Substring matching is the console allowlist's rule and only its rule
 * (`consoleErrorPolicy`). Using it here would quietly redact more than the other
 * three modules do, in the one place four modules must produce identical output.
 *
 * **`email` and `phone` are deliberately absent from the field list**, matching
 * all three shipped modules, which narrows a bullet in
 * `.kiro/steering/test-data-and-secrets.md`. Redacting the generated
 * `af-{runId}-{processTag}-{n}@example.invalid` address would destroy the single
 * most useful diagnostic in the suite — the one that makes an identity collision
 * readable from a log — and no real PII exists in this module at all: every
 * address is on a reserved domain and the one phone number is a reserved run of
 * zeros. ADR `0007-redaction-field-list-excludes-email-and-phone.md` is owed on
 * behalf of four modules now rather than three.
 *
 * **The `/g` footgun, which has no counterpart in the other three modules.** A
 * regex literal carrying `/g` keeps `lastIndex` state between calls when it is
 * reused with `.exec()` or `.test()`, so the second call starts mid-string and
 * silently misses a match. Every use below is `String.replace`, which resets
 * `lastIndex` on each call, and `.test()` is never called on a `/g` literal here.
 * Keep it that way.
 */

export const MARKER = '***REDACTED***';

// Header names redacted regardless of value.
const SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
];

// JSON field names redacted regardless of value.
const SENSITIVE_FIELDS: readonly string[] = [
  'password',
  'passwd',
  'current_password',
  'new_password',
  'password_confirmation',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'authorization',
  'ssn',
  'card',
  'card_number',
  'cvv',
  'pin',
];

// '"field": "value"' or '"field": 123' in a JSON body. The named group documents
// which capture carries the key; the replacer reads it positionally, because
// String.replace hands a function its groups by position and the named-group
// object arrives last, after arguments this module does not want to declare.
const JSON_FIELD = /("(?<key>[A-Za-z0-9_-]+)"\s*:\s*)("[^"]*"|[^,}\s]+)/g;

// A JWT anywhere in free text, including inside a URL query string.
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

// 'Bearer <token>' in free text. Group 1 is the scheme and survives; group 2 is
// the token and is replaced.
const BEARER = /(bearer\s+)([A-Za-z0-9._-]{8,})/gi;

// A run of 13 to 19 digits, the shape of a payment card number.
const CARD_LIKE = /\b\d{13,19}\b/g;

/** True when a header of this name must never have its value written out. */
export function isSensitiveHeader(headerName: string | undefined): boolean {
  if (headerName === undefined || headerName.trim() === '') {
    return false;
  }

  return SENSITIVE_HEADERS.includes(headerName.trim().toLowerCase());
}

/** Redacts a header value, returning the marker when the name is sensitive. */
export function header(headerName: string, value: string | undefined): string {
  if (isSensitiveHeader(headerName)) {
    return MARKER;
  }

  return text(value);
}

/**
 * Redacts a body or free-text blob.
 *
 * Two passes, both of which run: sensitive JSON fields by name, then token
 * shapes by pattern. A token can arrive either as a named field or embedded in a
 * URL.
 */
export function body(content: string | undefined): string {
  if (content === undefined || content === '') {
    return '';
  }

  return text(redactJsonFields(content));
}

/** Redacts token-shaped and card-shaped substrings in any text. */
export function text(content: string | undefined): string {
  if (content === undefined || content === '') {
    return '';
  }

  let result = content.replace(JWT, MARKER);
  result = result.replace(BEARER, `$1${MARKER}`);
  return result.replace(CARD_LIKE, MARKER);
}

function redactJsonFields(content: string): string {
  // The replacer is declared and passed by name, never inlined: a reader can go
  // and read it rather than parsing it here.
  return content.replace(JSON_FIELD, replaceSensitiveFieldValue);
}

/**
 * Replaces one matched JSON field's value with the marker when its name is
 * sensitive.
 *
 * The capture group holding `"field":` is kept verbatim so only the value is
 * replaced. Returning the marker alone would drop the key and change the shape of
 * the logged body, which is the shape a reader uses to tell which request failed.
 */
function replaceSensitiveFieldValue(match: string, fieldGroup: string, key: string): string {
  if (isSensitiveField(key)) {
    return `${fieldGroup}"${MARKER}"`;
  }

  return match;
}

function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELDS.includes(fieldName.trim().toLowerCase());
}
