package com.company.automation.models;

/**
 * An account this test run created and therefore owns.
 *
 * <p>Owning the account is the whole point. A test that needs to send a wrong password — to check
 * the rejection, or that the message does not reveal whether the account exists — increments a
 * server-side failed-attempt counter. On a shared account that counter eventually trips a lockout,
 * and the API then answers {@code 423 Locked} to every login, taking every happy path down with it.
 *
 * <p>That is not hypothetical: it happened to this repo, and it broke the Java and C# suites at the
 * same time. With a per-test account, locking it costs nothing, because nobody else will ever use
 * it.
 *
 * <p>{@code toString} is overridden because this record carries a password.
 */
public record TestAccount(String email, String password) {

  @Override
  public String toString() {
    return "TestAccount[email=" + email + ", password=***REDACTED***]";
  }
}
