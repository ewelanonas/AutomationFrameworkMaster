package com.company.automation.support;

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
 */
public final class RunContext {

  private static final String RUN_ID = resolveRunId();
  private static final AtomicInteger SEQUENCE = new AtomicInteger();

  private RunContext() {}

  /** Short, lowercase, filename-safe identifier for this run. */
  public static String runId() {
    return RUN_ID;
  }

  /**
   * Next correlation id for an outbound request. Format {@code af-<runId>-<n>} so a server-side log
   * search on the run id returns every request the suite made.
   */
  public static String nextCorrelationId() {
    return "af-" + RUN_ID + "-" + SEQUENCE.incrementAndGet();
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

    String random = java.util.UUID.randomUUID().toString().replace("-", "");
    return random.substring(0, 8);
  }
}
