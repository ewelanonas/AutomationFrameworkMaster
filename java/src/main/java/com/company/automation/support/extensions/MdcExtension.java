package com.company.automation.support.extensions;

import com.company.automation.support.RunContext;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.slf4j.MDC;

/**
 * Puts the test name and run id into the logging context.
 *
 * <p>With parallel execution, log lines from several tests interleave into one stream. Without a
 * per-test marker on every line, that stream is unreadable exactly when you need it. The Logback
 * pattern in {@code logback.xml} prints these MDC keys.
 *
 * <p>The context is always cleared in {@code afterEach}. A leaked MDC value gets attributed to
 * whichever test the thread runs next, which is worse than having none.
 */
public final class MdcExtension implements BeforeEachCallback, AfterEachCallback {

  private static final String TEST_NAME = "testName";
  private static final String RUN_ID = "runId";

  @Override
  public void beforeEach(ExtensionContext context) {
    MDC.put(TEST_NAME, context.getDisplayName());
    MDC.put(RUN_ID, RunContext.runId());
  }

  @Override
  public void afterEach(ExtensionContext context) {
    MDC.remove(TEST_NAME);
    MDC.remove(RUN_ID);
  }
}
