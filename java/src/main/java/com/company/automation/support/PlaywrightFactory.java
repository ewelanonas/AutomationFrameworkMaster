package com.company.automation.support;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.ViewportSize;
import java.nio.file.Path;
import java.util.Arrays;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Owns the Playwright lifecycle.
 *
 * <p>Two constraints drive the design:
 *
 * <ul>
 *   <li>Playwright objects are <b>not thread safe</b>. With JUnit parallel execution enabled, each
 *       thread needs its own {@link Playwright} and {@link Browser}, so both are {@link
 *       ThreadLocal}.
 *   <li>{@code Playwright.create()} launches a Node process and costs seconds. Creating one per
 *       test would dominate the suite runtime, so it is created once per thread and reused.
 * </ul>
 *
 * <p>A {@link BrowserContext} is cheap and gives complete isolation: separate cookies, storage, and
 * cache. That is why each test gets a fresh one rather than sharing a page. Sharing a page across
 * tests is the cause of the classic "fails only when it runs second" flake.
 */
public final class PlaywrightFactory {

  private static final Logger log = LoggerFactory.getLogger(PlaywrightFactory.class);

  private static final ThreadLocal<Playwright> PLAYWRIGHT = new ThreadLocal<>();
  private static final ThreadLocal<Browser> BROWSER = new ThreadLocal<>();

  private PlaywrightFactory() {}

  /** The browser for the current thread, launched on first use. */
  public static Browser browser() {
    Browser existing = BROWSER.get();
    if (existing != null) {
      return existing;
    }

    Config config = ConfigLoader.config();
    Playwright playwright = Playwright.create();

    // Applied once per Playwright instance. The attribute is per-application, so it comes from
    // config rather than being hardcoded: this repo's demo target uses data-test, not data-testid.
    playwright.selectors().setTestIdAttribute(config.execution().testIdAttribute());

    BrowserType browserType = browserTypeFor(playwright, config.execution().browser());
    BrowserType.LaunchOptions options = new BrowserType.LaunchOptions();
    options.setHeadless(config.execution().headless());

    // Disabling animations removes a whole class of "fails as the modal appears" flake.
    options.setArgs(Arrays.asList("--force-prefers-reduced-motion"));

    Browser launched = browserType.launch(options);

    PLAYWRIGHT.set(playwright);
    BROWSER.set(launched);

    log.debug(
        "Launched {} (headless={}) on thread {}",
        config.execution().browser(),
        config.execution().headless(),
        Thread.currentThread().getName());

    return launched;
  }

  /**
   * A fresh, isolated context for one test, with tracing already started.
   *
   * <p>Tracing is always started and only ever <i>saved</i> on failure. Starting it conditionally
   * would mean the first failure is the one run with no trace, which is precisely the run you need.
   */
  public static BrowserContext newContext() {
    Config config = ConfigLoader.config();

    Browser.NewContextOptions options = new Browser.NewContextOptions();
    options.setViewportSize(
        new ViewportSize(config.ui().viewportWidth(), config.ui().viewportHeight()));
    options.setLocale(config.ui().locale());
    options.setTimezoneId(config.ui().timezoneId());
    options.setBaseURL(config.ui().baseUrl());

    BrowserContext context = browser().newContext(options);
    context.setDefaultTimeout(config.timeouts().elementMs());
    context.setDefaultNavigationTimeout(config.timeouts().navigationMs());

    context
        .tracing()
        .start(
            new com.microsoft.playwright.Tracing.StartOptions()
                .setScreenshots(true)
                .setSnapshots(true)
                .setSources(true));

    return context;
  }

  /** Stops tracing, writing the trace file only when {@code tracePath} is non-null. */
  public static void stopTracing(BrowserContext context, Path tracePath) {
    com.microsoft.playwright.Tracing.StopOptions options =
        new com.microsoft.playwright.Tracing.StopOptions();
    if (tracePath != null) {
      options.setPath(tracePath);
    }
    context.tracing().stop(options);
  }

  /** Opens a page in the given context with the configured timeouts already applied. */
  public static Page newPage(BrowserContext context) {
    return context.newPage();
  }

  /**
   * Closes and clears this thread's browser. Removing the {@link ThreadLocal} matters: leaving it
   * set leaks a Node process per thread for the life of the JVM.
   */
  public static void closeForCurrentThread() {
    Browser browser = BROWSER.get();
    if (browser != null) {
      browser.close();
    }
    BROWSER.remove();

    Playwright playwright = PLAYWRIGHT.get();
    if (playwright != null) {
      playwright.close();
    }
    PLAYWRIGHT.remove();
  }

  private static BrowserType browserTypeFor(Playwright playwright, String name) {
    if ("firefox".equalsIgnoreCase(name)) {
      return playwright.firefox();
    }
    if ("webkit".equalsIgnoreCase(name)) {
      return playwright.webkit();
    }
    if ("chromium".equalsIgnoreCase(name)) {
      return playwright.chromium();
    }
    throw new IllegalArgumentException(
        "Unsupported browser '" + name + "'. Use chromium, firefox or webkit.");
  }
}
