package com.company.automation.support;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.WaitUntilState;

/**
 * The single navigation policy every page object uses.
 *
 * <p>Centralised for the same reason the timeout policy is: when navigation behaviour needs to
 * change, it should change in one place rather than in every page object.
 *
 * <p>The policy waits for {@code DOMCONTENTLOADED} rather than the default {@code LOAD}. Against a
 * single-page application that difference matters. {@code LOAD} waits for every subresource, and
 * this application's client-side router frequently supersedes the initial navigation before those
 * finish — which surfaces as {@code net::ERR_ABORTED} on a page that in fact rendered perfectly
 * well.
 *
 * <p>This class is a late arrival, and the story of why is worth keeping. {@code Navigation.cs} and
 * {@code navigation.py} have existed since their modules were built; this module called {@code
 * page.navigate(path)} bare, and the Python docstring recorded the gap in writing. Nothing failed,
 * because the public demo target serves a production Angular build where {@code LOAD} settles
 * quickly. The gap only became visible when CI moved to a self-hosted target running {@code ng
 * serve}: a development server holds a live-reload websocket open and ships unminified bundles, so
 * {@code LOAD} does not settle, and four UI tests timed out in this module while the C# and Python
 * suites passed against the same containers. A parity gap that costs nothing on one target can be
 * fatal on another, which is the argument for closing them when they are found rather than when
 * they bite.
 *
 * <p>Waiting for the DOM is not a shortcut that risks acting on an unready page: every interaction
 * afterwards goes through an auto-waiting locator, so the element-level waits do the real work.
 */
public final class Navigation {

  private Navigation() {}

  /**
   * Navigates to a path relative to the configured base URL.
   *
   * @param page the page to navigate
   * @param path a path relative to the base URL, such as {@code "/"} or {@code "/auth/login"}
   */
  public static void to(Page page, String path) {
    Page.NavigateOptions options = new Page.NavigateOptions();
    options.setWaitUntil(WaitUntilState.DOMCONTENTLOADED);
    options.setTimeout(ConfigLoader.config().timeouts().navigationMs());
    page.navigate(path, options);
  }
}
