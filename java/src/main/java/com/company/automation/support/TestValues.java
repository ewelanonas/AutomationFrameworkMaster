package com.company.automation.support;

import java.util.Locale;
import java.util.Random;
import net.datafaker.Faker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Generated values that are unique per run and reproducible on demand.
 *
 * <p>The faker is seeded, and the seed is logged. Without that, a failure caused by a particular
 * generated value can never be reproduced — you get a red test, a re-run that passes, and no
 * explanation. Set {@code AF_DATA_SEED} to the logged value to replay a run's data exactly.
 *
 * <p>Generated identities use reserved test domains only. A real domain in test data eventually
 * means real email sent to a real person.
 */
public final class TestValues {

  private static final Logger log = LoggerFactory.getLogger(TestValues.class);

  private static final long SEED = resolveSeed();
  private static final ThreadLocal<Faker> FAKER =
      ThreadLocal.withInitial(() -> new Faker(Locale.ENGLISH, new Random(SEED)));

  static {
    log.info(
        "Test data seed: {}. Set AF_DATA_SEED={} to reproduce this run's generated data.",
        SEED,
        SEED);
  }

  private TestValues() {}

  /**
   * The seed for this run: {@code AF_DATA_SEED} when set, otherwise a fresh random one.
   *
   * <p>A fixed default would be worse than random. It would hide the whole class of bug where a
   * test only passes for one particular generated value, because every run would use that same
   * value.
   */
  private static long resolveSeed() {
    String fromEnv = System.getenv("AF_DATA_SEED");
    if (fromEnv != null && !fromEnv.isBlank()) {
      try {
        return Long.parseLong(fromEnv.trim());
      } catch (NumberFormatException e) {
        throw new IllegalStateException(
            "AF_DATA_SEED must be a whole number, but was '" + fromEnv + "'.", e);
      }
    }
    return new java.util.Random().nextLong();
  }

  /** Faker for the current thread. Seeded, so two threads produce the same stream independently. */
  public static Faker faker() {
    return FAKER.get();
  }

  /** Unique, run-scoped email on a reserved domain that cannot deliver mail. */
  public static String uniqueEmail() {
    return "af-" + RunContext.runId() + "-" + RunContext.nextSequence() + "@example.invalid";
  }

  /** Unique, run-scoped name prefixed so a janitor job can find leftovers. */
  public static String uniqueName(String prefix) {
    return prefix + "-af-" + RunContext.runId() + "-" + RunContext.nextSequence();
  }

  /**
   * An id that is syntactically valid for the target API but certain not to exist.
   *
   * <p>Shaped as a 26-character ULID because the demo API rejects anything else before it gets as
   * far as looking the record up — which would test the wrong thing. A 404 test has to send an id
   * the service accepts as well formed.
   */
  public static String wellFormedButMissingId() {
    return "0AF00000000000000000000000";
  }
}
