package com.company.automation;

import com.company.automation.clients.AuthClient;
import com.company.automation.clients.ProductsClient;
import com.company.automation.flows.AuthFlow;
import com.company.automation.support.Config;
import com.company.automation.support.ConfigLoader;
import com.company.automation.support.extensions.BrowserExtension;
import com.company.automation.support.extensions.MdcExtension;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import java.util.List;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * One thin base class for UI tests.
 *
 * <p>The browser lifecycle and failure artifacts come from {@link BrowserExtension}, not from
 * {@code @BeforeEach}/{@code @AfterEach} here. That is what allows a screenshot of the actual
 * failure to be captured before the page is closed.
 *
 * <p>API clients are available to UI tests deliberately: preconditions are seeded over the API,
 * never built by clicking through the interface.
 */
@ExtendWith({MdcExtension.class, BrowserExtension.class})
public abstract class UiTestBase {

  protected final Config config = ConfigLoader.config();
  protected final ProductsClient products = new ProductsClient();
  protected final AuthClient auth = new AuthClient();
  protected final AuthFlow authFlow = new AuthFlow();

  /** The page for this test. */
  protected Page page() {
    return BrowserExtension.page();
  }

  /** The isolated browser context for this test. */
  protected BrowserContext browserContext() {
    return BrowserExtension.context();
  }

  /**
   * Browser console errors recorded during this test.
   *
   * <p>Available so a test can assert the page logged nothing unexpected. A page that throws in the
   * console while still rendering correctly is a real defect that functional assertions miss.
   */
  protected List<String> consoleErrors() {
    return BrowserExtension.consoleErrors();
  }

  /**
   * Console errors worth failing a test for, with known third-party and application noise filtered
   * out by {@link com.company.automation.support.ConsoleErrorPolicy}.
   *
   * <p>This is the accessor tests should use. The unfiltered {@link #consoleErrors()} is for
   * diagnostics, because a blanket assertion of zero console errors against a real application
   * fails constantly and gets deleted within a week.
   */
  protected List<String> significantConsoleErrors() {
    return com.company.automation.support.ConsoleErrorPolicy.significant(consoleErrors());
  }
}
