/**
 * Locates repository-level directories, whatever the launch directory is.
 *
 * Mirrors `RepoPaths.cs`, `RepoPaths.java` and `repo_paths.py`: the same marker,
 * the same ten-level limit and the same message shape. A relative path that only
 * works from one launch directory is the most common reason a suite runs in the
 * IDE but not in CI.
 *
 * One deliberate improvement on the three shipped modules: the walk starts from
 * **this file's own directory**, not from `process.cwd()`. That is what lets this
 * module ship without the invocation-directory guard `python/conftest.py` needs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'shared/environments';
const MAX_LEVELS_UP = 10;

function moduleDirectory(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/** The repository root: the nearest ancestor holding `shared/environments`. */
export function repoRoot(): string {
  const start = moduleDirectory();
  let current = start;

  for (let level = 0; level <= MAX_LEVELS_UP; level += 1) {
    if (fs.existsSync(path.join(current, 'shared', 'environments'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(
    `Could not locate the repository root. Looked for a '${MARKER}' directory in ` +
      `'${start}' and up to ${String(MAX_LEVELS_UP)} parents. ` +
      'Run the suite with the documented command: pnpm --dir typescript test',
  );
}

/** Directory holding the non-secret environment descriptors. */
export function environments(): string {
  return path.join(repoRoot(), 'shared', 'environments');
}

/** Directory holding the JSON Schema contracts. */
export function contracts(): string {
  return path.join(repoRoot(), 'shared', 'contracts');
}

/**
 * Directory for this module's reports and failure artifacts.
 *
 * Per-module by design: C# uses `csharp/TestResults`, Java `java/target`, Python
 * `python/reports`. `.gitignore` already covers `reports/` at any depth.
 */
export function reports(): string {
  return path.join(repoRoot(), 'typescript', 'reports');
}
