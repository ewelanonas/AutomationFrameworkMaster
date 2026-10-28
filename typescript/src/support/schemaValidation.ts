/**
 * Validates real responses against the JSON Schemas in `shared/contracts/`.
 *
 * The schemas set `additionalProperties: false`, so this catches a field the
 * service quietly added, removed or renamed — the change that otherwise goes
 * unnoticed until something downstream breaks. The same four files are validated
 * by the C# and Java modules with different validators, which is what makes the
 * contract shared rather than duplicated: four modules agree on the schema, not on
 * a library.
 *
 * `shared/contracts/` is **read-only for this module**. The other three modules
 * validate against those exact bytes, so nothing here may edit a schema file — not
 * to add a `$id`, not to inline a reference, not to relax a rule.
 *
 * CROSS-FILE `$ref` RESOLUTION — VERIFIED, NOT ASSUMED
 * ---------------------------------------------------
 * Every `*.schema.json` is loaded once into **one** `Ajv2020` instance under its
 * **bare file name** as the schema key. `toolshop-paged-products.schema.json`'s
 * cross-file reference is the literal relative string
 * `"toolshop-product.schema.json"` and the schemas declare no `$id`, so ajv takes
 * the registration key as the referring schema's base URI and same-directory
 * relative resolution yields the other schema's key. The seven internal
 * `#/$defs/...` references in `toolshop-product.schema.json` are fragment-only and
 * never leave the document.
 *
 * That reasoning is from ajv's documented behaviour, and the whole contract suite
 * rests on it, so it was **run** before a single contract case was written: a real
 * paged-products response validates with an empty violation list, with no network
 * fetch and no file URIs to get wrong across Windows and Linux. The explicit
 * `addSchema(contents, fileName)` loop below is the shape that shipped; no `$id`
 * injection and no schema inlining was needed.
 *
 * CONSTRUCTION
 * ------------
 * - `allErrors: true` — the value of a contract failure is the full list of
 *   drifted properties, not the first one.
 * - `validateFormats: false` — matches C#'s `RequireFormatValidation = false`. No
 *   shared schema uses `format`, so this changes nothing today and keeps the four
 *   modules aligned if one ever does.
 * - `strict: false` — ajv's strict *mode* is about meta-level schema hygiene
 *   (unknown keywords, union-type warnings), not about `additionalProperties`. The
 *   strictness that matters is already written into the schemas. Leaving strict
 *   mode on risks failing the suite on a schema's own `title` and `description`
 *   rather than on a real drift.
 *
 * IMPORT SHAPE
 * ------------
 * ajv 8.20.0 is plain CommonJS with no `exports` map and this package is ESM, so
 * the import is the default one below and `tsconfig` sets `esModuleInterop: true`.
 * Importing a CJS default export from ESM is a known sharp edge, so it was
 * confirmed rather than assumed: `import Ajv2020 from 'ajv/dist/2020.js'` resolves
 * to the class under Node ESM *and* type-checks under `verbatimModuleSyntax`. The
 * named import and a `createRequire(import.meta.url)` form were both available as
 * fallbacks and neither was needed. No branch would have needed `any`.
 */

import fs from 'node:fs';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';

import * as redaction from './redaction';
import * as repoPaths from './repoPaths';
import { requireValue } from './require';

const PREVIEW_CHARACTERS = 300;
const SCHEMA_SUFFIX = '.schema.json';

/** One lazily built instance for the process, holding every contract schema. */
let loaded: LoadedContracts | undefined;

interface LoadedContracts {
  readonly validator: Ajv2020;
  readonly schemaNames: readonly string[];
}

/**
 * The violations. **An empty list means the payload conforms.**
 *
 * Schema violations are a normal outcome here — the test asserts the list is
 * empty. Everything that is *not* a violation throws: an unusable schema name, an
 * empty body and a non-JSON body are all arrangement failures, and each gets a
 * message that says which.
 */
export function validate(schemaFileName: string, jsonText: string | undefined): string[] {
  const validateFunction = schemaFor(schemaFileName);

  if (jsonText === undefined || jsonText.trim() === '') {
    throw new Error('Response body is empty, so it cannot be validated against a schema.');
  }

  // Parsed BEFORE any validator work, so an unparseable body fails readably rather
  // than inside the validator.
  let instance: unknown;
  try {
    instance = JSON.parse(jsonText);
  } catch (parseError) {
    throw new Error(
      'Response body is not valid JSON, so it cannot be validated against a schema. ' +
        `Body starts: ${redaction.body(preview(jsonText))}`,
      { cause: parseError },
    );
  }

  const conforms = validateFunction(instance);
  if (conforms) {
    return [];
  }

  // Copied off the validate function before anything else can call it: ajv stores the
  // errors on the function object and overwrites them on the next invocation.
  const errors: ErrorObject[] = [...(validateFunction.errors ?? [])];

  // Sorted so two runs against the same drift report in the same order, and in the
  // same order as the other three modules. A NAMED comparator, never an inline chain.
  errors.sort(compareByPathSegments);

  const violations: string[] = [];
  for (const error of errors) {
    violations.push(describeViolation(error));
  }

  return violations;
}

/**
 * One violation line: `${location}: ${message}${additionalPropertySuffix}`.
 *
 * `location` is ajv's `instancePath`, already a JSON Pointer (`/data/0/id`), with
 * `(root)` substituted for the empty string. That matches C#'s `InstanceLocation`
 * and Python's pointer form, so all four modules point at the same drift in the
 * same notation. The notation lines up; **the message text does not, and the claim
 * stops there** — ajv says `must NOT have additional properties` where Python's
 * `jsonschema` says `Additional properties are not allowed ('parent_id' was
 * unexpected)`. Four outputs that can be read side by side, not four outputs that
 * diff to nothing.
 */
function describeViolation(error: ErrorObject): string {
  return `${locationOf(error)}: ${error.message ?? '(no message)'}${offendingPropertyOf(error)}`;
}

function locationOf(error: ErrorObject): string {
  if (error.instancePath === '') {
    return '(root)';
  }

  return error.instancePath;
}

/**
 * ` (parent_id)` for an `additionalProperties` error, and an empty string otherwise.
 *
 * ajv's message for that keyword is the unhelpful `must NOT have additional
 * properties` and the offending key is in `error.params.additionalProperty`, so the
 * suffix appends it and the line reads
 * `/category: must NOT have additional properties (parent_id)`. Without it the
 * contract suite would be strictly less useful than the other three, which is how
 * the two real schema gaps recorded in `java/README.md` were found.
 *
 * `error.params` is typed `Record<string, any>`, so it is narrowed with one `as` to
 * a record of `unknown` before anything is read off it. No `any` reaches a field
 * read.
 */
function offendingPropertyOf(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  const offending = params['additionalProperty'];

  if (typeof offending !== 'string' || offending === '') {
    return '';
  }

  return ` (${offending})`;
}

/**
 * `'/data/2/id'` -> `['data', '2', 'id']`; the leading `''` is dropped.
 *
 * Violations are sorted by these **segments, not by the pointer string**.
 * `schema_validation.py` sorts with `key=lambda error: list(error.absolute_path)`,
 * which compares segment by segment, so `/data/2` precedes `/data/10`; sorting the
 * pointer strings reverses that pair. On a 50-product page with a multi-property
 * drift the difference is visible.
 */
function instancePathSegments(error: ErrorObject): string[] {
  return error.instancePath.split('/').slice(1);
}

/**
 * Walks both segment arrays with a plain loop, comparing two all-digit segments as
 * numbers and anything else as strings, and treating the shorter array as smaller
 * when one is a prefix of the other.
 */
function compareByPathSegments(left: ErrorObject, right: ErrorObject): number {
  const leftSegments = instancePathSegments(left);
  const rightSegments = instancePathSegments(right);
  const shared = Math.min(leftSegments.length, rightSegments.length);

  for (let index = 0; index < shared; index += 1) {
    const leftSegment = requireValue(leftSegments[index], 'a left-hand instance path segment');
    const rightSegment = requireValue(rightSegments[index], 'a right-hand instance path segment');

    const comparison = compareSegments(leftSegment, rightSegment);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return leftSegments.length - rightSegments.length;
}

function compareSegments(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }

  return 0;
}

/**
 * The compiled validator for one schema, by bare file name.
 *
 * An unknown name lists the available ones and says where contracts live, because
 * the realistic mistake is a typo and the realistic second mistake is looking for
 * the file in the wrong module.
 */
function schemaFor(schemaFileName: string): ValidateFunction {
  const contracts = contractsOf();
  const found = contracts.validator.getSchema(schemaFileName);

  if (found === undefined) {
    const available = [...contracts.schemaNames].sort().join(', ');

    throw new Error(
      `No schema named '${schemaFileName}' in ${repoPaths.contracts()}. ` +
        `Available: ${available}. ` +
        'Contracts live in shared/contracts/ and are committed.',
    );
  }

  return found;
}

/**
 * Loads every contract file exactly once, keyed by bare file name.
 *
 * An empty contracts directory is **its own error**: without it, a bad checkout
 * would surface much later as "unknown schema name" and send the reader looking for
 * a typo that does not exist.
 */
function contractsOf(): LoadedContracts {
  if (loaded !== undefined) {
    return loaded;
  }

  const directory = repoPaths.contracts();
  const validator = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const schemaNames: string[] = [];

  for (const fileName of fs.readdirSync(directory).sort()) {
    if (!fileName.endsWith(SCHEMA_SUFFIX)) {
      continue;
    }

    const text = fs.readFileSync(path.join(directory, fileName), 'utf8');
    // `JSON.parse` hands back `any`, so the result is captured as `unknown` and then
    // narrowed with ONE `as` to ajv's own parameter type. That is a single assertion
    // out of `unknown` — not the banned double cast that launders a value through
    // `unknown` into an unrelated type — and no `any` reaches a field read.
    const parsed: unknown = JSON.parse(text);

    validator.addSchema(parsed as AnySchema, fileName);
    schemaNames.push(fileName);
  }

  if (schemaNames.length === 0) {
    throw new Error(`No ${SCHEMA_SUFFIX} files found in ${directory}.`);
  }

  loaded = { validator, schemaNames };

  return loaded;
}

function preview(jsonText: string): string {
  if (jsonText.length <= PREVIEW_CHARACTERS) {
    return jsonText;
  }

  return jsonText.slice(0, PREVIEW_CHARACTERS) + '...';
}
