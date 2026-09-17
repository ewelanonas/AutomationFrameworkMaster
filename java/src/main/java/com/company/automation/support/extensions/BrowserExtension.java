package com.company.automation.support.extensions;

import com.company.automation.support.PlaywrightFactory;
import com.company.automation.support.RunContext;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.ScreenshotType;
import io.qameta.allure.Allure;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestExecutionExceptionHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Gives each test a fresh browser context and page, and captures failure artifacts before closing.
 *
 * <p>The failure capture is why this is an extension rather than a {@code @BeforeEach} in a base
 * class. {@code TestWatcher.testFailed} runs <i>after</i> {@code afterEach}, by which time the page
 * is gone. Recording the failure in {@link #handleTestExecutionException} and acting on it in
 * {@link #afterEach} is what makes a screenshot of the actual failure possible.
 *
 * <p>Everything is {@link ThreadLocal} because JUnit runs tests concurrently. A shared page would
 * produce failures that look like product bugs and are not.
 */
public final class BrowserExtension
    implements BeforeEachCallback, AfterEachCallback, TestExecutionExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(BrowserExtension.class);

  private static final ThreadLocal<BrowserContext> CONTEXT = new ThreadLocal<>();
  private static final ThreadLocal<Page> PAGE = new ThreadLocal<>();
  private static final ThreadLocal<Boolean> FAILED = ThreadLocal.withInitial(() -> Boolean.FALSE);
  private static final ThreadLocal<List<String>> CONSOLE_ERRORS = new ThreadLocal<>();

  /** The page for the current test. */
  public static Page page() {
    Page page = PAGE.get();
    if (page == null) {
      throw new IllegalStateException(
          "No page for this test. Add @ExtendWith(BrowserExtension.class), or extend UiTestBase.");
    }
    return page;
  }

  /** The browser context for the current test, for storage state and cookie work. */
  public static BrowserContext context() {
    BrowserContext context = CONTEXT.get();
    if (context == null) {
      throw new IllegalStateException("No browser context for this test.");
    }
    return context;
  }

  /**
   * Browser console errors seen during this test. Exposed so a test can assert the page logged
   * nothing unexpected — a genuine defect class that functional assertions miss entirely.
   */
  public static List<String> consoleErrors() {
    List<String> errors = CONSOLE_ERRORS.get();
    if (errors == null) {
      return new ArrayList<>();
    }
    return new ArrayList<>(errors);
  }

  @Override
  public void beforeEach(ExtensionContext extensionContext) {
    FAILED.set(Boolean.FALSE);

    BrowserContext context = PlaywrightFactory.newContext();
    Page page = PlaywrightFactory.newPage(context);

    List<String> consoleErrors = new ArrayList<>();
    CONSOLE_ERRORS.set(consoleErrors);

    page.onConsoleMessage(
        message -> {
          if ("error".equals(message.type())) {
            consoleErrors.add(message.text());
          }
        });
    page.onPageError(consoleErrors::add);

    CONTEXT.set(context);
    PAGE.set(page);
  }

  @Override
  public void handleTestExecutionException(ExtensionContext extensionContext, Throwable throwable)
      throws Throwable {
    FAILED.set(Boolean.TRUE);
    throw throwable;
  }

  @Override
  public void afterEach(ExtensionContext extensionContext) {
    BrowserContext context = CONTEXT.get();
    Page page = PAGE.get();
    boolean failed = Boolean.TRUE.equals(FAILED.get());

    try {
      if (failed && page != null) {
        captureArtifacts(page, extensionContext);
      }
      if (context != null) {
        Path tracePath = null;
        if (failed) {
          tracePath = artifactPath(extensionContext, "trace.zip");
        }
        PlaywrightFactory.stopTracing(context, tracePath);
        if (tracePath != null) {
          attachFile("Playwright trace", tracePath, "application/zip", "zip");
          log.info(
              "Trace written to {}. Open it with: npx playwright show-trace {}",
              tracePath,
              tracePath);
        }
      }
    } finally {
      if (context != null) {
        context.close();
      }
      CONTEXT.remove();
      PAGE.remove();
      CONSOLE_ERRORS.remove();
      FAILED.remove();
    }
  }

  private void captureArtifacts(Page page, ExtensionContext extensionContext) {
    // Each capture is guarded separately: if the browser died, a screenshot will fail but the page
    // HTML may still be retrievable, and losing one artifact must not cost the others.
    attachScreenshot(page);
    attachPageHtml(page);
    attachDiagnostics(page, extensionContext);
  }

  private void attachScreenshot(Page page) {
    try {
      byte[] png =
          page.screenshot(
              new Page.ScreenshotOptions().setFullPage(true).setType(ScreenshotType.PNG));
      Allure.getLifecycle().addAttachment("Screenshot at failure", "image/png", "png", png);
    } catch (RuntimeException e) {
      log.warn("Could not capture a screenshot: {}", e.getMessage());
    }
  }

  private void attachPageHtml(Page page) {
    try {
      Allure.addAttachment("Page HTML at failure", "text/html", page.content(), ".html");
    } catch (RuntimeException e) {
      log.warn("Could not capture page HTML: {}", e.getMessage());
    }
  }

  private void attachDiagnostics(Page page, ExtensionContext extensionContext) {
    StringBuilder out = new StringBuilder();
    out.append("test: ").append(extensionContext.getDisplayName()).append('\n');
    out.append("runId: ").append(RunContext.runId()).append('\n');
    out.append("thread: ").append(Thread.currentThread().getName()).append('\n');

    try {
      out.append("url: ").append(page.url()).append('\n');
      out.append("title: ").append(page.title()).append('\n');
    } catch (RuntimeException e) {
      out.append("url/title unavailable: ").append(e.getMessage()).append('\n');
    }

    List<String> errors = consoleErrors();
    out.append("browser console errors: ").append(errors.size()).append('\n');
    for (String error : errors) {
      out.append("  - ").append(error).append('\n');
    }

    Allure.addAttachment("Failure diagnostics", "text/plain", out.toString());
  }

  private void attachFile(String name, Path path, String contentType, String extension) {
    try {
      byte[] bytes = Files.readAllBytes(path);
      Allure.getLifecycle().addAttachment(name, contentType, extension, bytes);
    } catch (IOException e) {
      log.warn("Could not attach {} from {}: {}", name, path, e.getMessage());
    }
  }

  private Path artifactPath(ExtensionContext extensionContext, String fileName) {
    String testName = extensionContext.getDisplayName().toLowerCase(Locale.ROOT);
    StringBuilder safe = new StringBuilder();
    for (int i = 0; i < testName.length(); i++) {
      char c = testName.charAt(i);
      if (Character.isLetterOrDigit(c)) {
        safe.append(c);
      } else if (safe.length() > 0 && safe.charAt(safe.length() - 1) != '-') {
        safe.append('-');
      }
    }

    Path directory =
        com.company.automation.support.RepoPaths.reports()
            .resolve("failure-artifacts")
            .resolve(RunContext.runId())
            .resolve(safe.toString());
    try {
      Files.createDirectories(directory);
    } catch (IOException e) {
      throw new IllegalStateException("Could not create the artifact directory " + directory, e);
    }
    return directory.resolve(fileName);
  }

  /**
   * Writes arbitrary text next to the other artifacts for this test. Used by diagnostics helpers.
   */
  public static void writeArtifact(
      ExtensionContext extensionContext, String fileName, String content) {
    Path path = new BrowserExtension().artifactPath(extensionContext, fileName);
    try {
      Files.writeString(path, content, StandardCharsets.UTF_8);
    } catch (IOException e) {
      log.warn("Could not write artifact {}: {}", path, e.getMessage());
    }
  }

  /**
   * Attaches an in-memory PNG. Kept public so a flow can snapshot a mid-journey state on purpose.
   */
  public static void attachPng(String name, byte[] png) {
    Allure.getLifecycle()
        .addAttachment(name, "image/png", "png", new ByteArrayInputStream(png).readAllBytes());
  }
}
