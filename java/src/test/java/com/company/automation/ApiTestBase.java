package com.company.automation;

import com.company.automation.clients.AuthClient;
import com.company.automation.clients.ProductsClient;
import com.company.automation.support.Config;
import com.company.automation.support.ConfigLoader;
import com.company.automation.support.extensions.MdcExtension;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * One thin base class for API and contract tests: clients and config, nothing else.
 *
 * <p>It stays thin on purpose. A base class that accumulates helpers becomes the place nobody can
 * safely change, and it hides where behaviour comes from. Cross-cutting behaviour belongs in a
 * JUnit extension, which is why logging context arrives via {@link MdcExtension} rather than a
 * {@code @BeforeEach} here.
 */
@ExtendWith(MdcExtension.class)
public abstract class ApiTestBase {

  protected final Config config = ConfigLoader.config();
  protected final ProductsClient products = new ProductsClient();
  protected final AuthClient auth = new AuthClient();

  /**
   * Registers disposable accounts. Any test that signs in uses one of these rather than a shared
   * account — see {@link com.company.automation.flows.AccountFlow} for what happened when they did
   * not.
   */
  protected final com.company.automation.flows.AccountFlow accounts =
      new com.company.automation.flows.AccountFlow();
}
