package com.company.automation.support;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Locates repository-level directories so the module works the same whether Maven runs from the
 * repo root or from inside {@code java/}, and whether an IDE sets the working directory to either.
 *
 * <p>Everything is resolved by walking up from the working directory looking for a marker, rather
 * than by hardcoding {@code ../}. A relative path that only works from one launch directory is the
 * most common reason a suite runs in the IDE but not in CI.
 */
public final class RepoPaths {

  private static final String MARKER = "shared/environments";
  private static final int MAX_LEVELS_UP = 6;

  private RepoPaths() {}

  /**
   * The repository root: the nearest ancestor directory that contains {@code shared/environments}.
   */
  public static Path repoRoot() {
    Path current = Paths.get("").toAbsolutePath().normalize();

    for (int level = 0; level <= MAX_LEVELS_UP; level++) {
      if (current == null) {
        break;
      }
      Path candidate = current.resolve(MARKER);
      if (Files.isDirectory(candidate)) {
        return current;
      }
      current = current.getParent();
    }

    throw new IllegalStateException(
        "Could not locate the repository root. Looked for a '"
            + MARKER
            + "' directory in the working directory and up to "
            + MAX_LEVELS_UP
            + " parents, starting at "
            + Paths.get("").toAbsolutePath().normalize()
            + ". Run Maven from the repository root or from the java/ directory.");
  }

  /** Directory holding the non-secret environment descriptors. */
  public static Path environments() {
    return repoRoot().resolve("shared").resolve("environments");
  }

  /** Directory holding the JSON Schema contracts. */
  public static Path contracts() {
    return repoRoot().resolve("shared").resolve("contracts");
  }

  /** Directory for this run's reports and failure artifacts. */
  public static Path reports() {
    return repoRoot().resolve("java").resolve("target");
  }
}
