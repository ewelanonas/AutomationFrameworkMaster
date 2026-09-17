package com.company.automation.support;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Separates browser console errors worth failing a test for from known, accepted noise.
 *
 * <p>A page that renders correctly while throwing in the console is a real defect that functional
 * assertions never notice, so the check is worth having. But a blanket "no console errors"
 * assertion against an application with third-party scripts fails constantly and gets deleted
 * within a week.
 *
 * <p>The middle ground is a reviewed allowlist. Every entry needs a reason. An entry with no reason
 * is how a real defect gets silently accepted, so the reason is not decoration.
 */
public final class ConsoleErrorPolicy {

  /**
   * Known noise on the demo target, each with the reason it is tolerated.
   *
   * <ul>
   *   <li>{@code status of 401} — the browser's own message for the failed request. The catalogue
   *       page fires an authenticated call while signed out, on every anonymous page load. It is
   *       the application's own behaviour, not something the suite introduced, and the page still
   *       renders correctly.
   *   <li>{@code error {message: unauthorized}} — the application's own handler logging that same
   *       401. Matched as the exact observed string rather than on the word "unauthorized" alone,
   *       so a genuine authorization defect logged in different words is still reported.
   *       Server-side authorization is covered directly by the API tests, which assert 401 and 403
   *       themselves.
   *   <li>{@code favicon} — a missing icon is not a functional failure.
   *   <li>{@code ERR_BLOCKED_BY_CLIENT} / {@code net::ERR_BLOCKED} — a local ad or tracker blocker
   *       cancelling a third-party request. Depends on the developer's browser profile, not on the
   *       application.
   * </ul>
   *
   * <p>When an entry here starts hiding something real, delete it and fix the cause. Do not add an
   * entry to make a red test green without understanding what produced it.
   */
  private static final List<String> ACCEPTED_NOISE =
      List.of(
          "status of 401",
          "error {message: unauthorized}",
          "favicon",
          "err_blocked_by_client",
          "net::err_blocked",
          "third-party cookie");

  private ConsoleErrorPolicy() {}

  /**
   * Returns only the console errors that should fail a test.
   *
   * <p>A plain loop with an early {@code continue}, rather than a stream chain: the reader may not
   * be a Java specialist, and this is the method they will be reading when a test fails on console
   * noise.
   */
  public static List<String> significant(List<String> allErrors) {
    List<String> significant = new ArrayList<>();

    for (String error : allErrors) {
      if (isAcceptedNoise(error)) {
        continue;
      }
      significant.add(error);
    }

    return significant;
  }

  private static boolean isAcceptedNoise(String error) {
    if (error == null || error.isBlank()) {
      return true;
    }
    String lower = error.toLowerCase(Locale.ROOT);

    for (String accepted : ACCEPTED_NOISE) {
      if (lower.contains(accepted)) {
        return true;
      }
    }
    return false;
  }
}
