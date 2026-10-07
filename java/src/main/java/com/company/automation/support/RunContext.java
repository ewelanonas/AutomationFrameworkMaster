package com.company.automation.support;

import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Identity for a single execution of the suite.
 *
 * <p>The run id ties together every generated value, every log line, and every correlation header
 * from one run. When a test fails in CI and leaves data behind, the run id is what lets you find
 * both the log and the orphaned record.
 *
 * <p>Set {@code AF_RUN_ID} to reuse an id — useful when re-running a single test against data an
 * earlier run created.
 *
 * <p>The run id is deliberately shared between processes that belong to one pipeline run, so {@link
 * #processTag()} is what keeps a generated identity unique per process.
 */
public final class RunContext {

  private static final String RUN_ID = resolveRunId();
  private static final String PROCESS_TAG = buildProcessTag();
  private static final AtomicInteger SEQUENCE = new AtomicInteger();

  private RunContext() {}

  /** Short, lowercase, filename-safe identifier for this run. */
  public static String runId() {
    return RUN_ID;
  }

  /**
   * Discriminator for this process, minted once. Makes generated identities unique between two
   * processes that share a run id.
   *
   * <p>The run id is deliberately shared: it comes from {@code GITHUB_RUN_ID} so a generated record
   * can be traced back to the pipeline run that created it. That sharing is also what broke the
   * suite — the Java and C# jobs of one workflow run resolved the same run id, restarted their own
   * counters at 1, and the second job re-registered the first job's email addresses, so the API
   * answered {@code 409}. This tag is what makes the identity unique per process while the run id
   * stays traceable.
   */
  public static String processTag() {
    return PROCESS_TAG;
  }

  /**
   * Next correlation id for an outbound request. Format {@code af-<runId>-<processTag>-<n>} so a
   * server-side log search on the run id returns every request the suite made.
   */
  public static String nextCorrelationId() {
    return "af-" + RUN_ID + "-" + PROCESS_TAG + "-" + SEQUENCE.incrementAndGet();
  }

  /** Next value in the run-scoped sequence. Used by builders to keep generated data unique. */
  public static int nextSequence() {
    return SEQUENCE.incrementAndGet();
  }

  private static String resolveRunId() {
    String fromEnv = System.getenv("AF_RUN_ID");
    if (fromEnv != null && !fromEnv.isBlank()) {
      return fromEnv.trim();
    }

    // CI build number makes a run traceable back to the pipeline that produced it.
    String ciRun = System.getenv("GITHUB_RUN_ID");
    if (ciRun != null && !ciRun.isBlank()) {
      return ciRun.trim();
    }

    return shortRandomHex();
  }

  /**
   * Builds this process's tag: the CI per-job key and attempt number when present, followed by
   * random hex; random hex alone otherwise.
   *
   * <p>Random alone is only probabilistically unique. Where the CI provider hands us a key that is
   * unique by construction within one run — the job key, plus the attempt number, which is what
   * distinguishes a re-run since {@code GITHUB_RUN_ID} is preserved across attempts — that key is
   * folded in, so the two processes that actually collided cannot collide again. The random part is
   * always present: it is what separates two local processes, two test hosts inside one job, and
   * two legs of a matrix job, since the job key does not include matrix values. The job key is
   * truncated to 12 characters, so the construction-level guarantee covers job keys that differ
   * within those 12 characters and the random part separates them beyond that.
   */
  private static String buildProcessTag() {
    String random = shortRandomHex();

    String jobPart = safeTagPart(System.getenv("GITHUB_JOB"), 12);
    if (jobPart.isEmpty()) {
      return random;
    }

    String attemptPart = safeTagPart(System.getenv("GITHUB_RUN_ATTEMPT"), 2);
    if (attemptPart.isEmpty()) {
      attemptPart = "1";
    }

    return jobPart + "-" + attemptPart + "-" + random;
  }

  /** Lowercase letters and digits only, so a tag is safe in an email local part and a path. */
  private static String safeTagPart(String value, int maxLength) {
    if (value == null || value.isBlank()) {
      return "";
    }

    StringBuilder safe = new StringBuilder();
    for (char character : value.toLowerCase(Locale.ROOT).toCharArray()) {
      if (safe.length() == maxLength) {
        break;
      }
      if (Character.isLetterOrDigit(character)) {
        safe.append(character);
      }
    }
    return safe.toString();
  }

  private static String shortRandomHex() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
  }
}
