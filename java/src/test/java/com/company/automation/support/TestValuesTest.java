package com.company.automation.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The shape of a generated identity, checked without touching the network.
 *
 * <p>These exist because of a CI failure. Both module jobs of one workflow run resolved the same
 * run id from {@code GITHUB_RUN_ID}, each restarted its own counter at 1, and the second job
 * re-registered the first job's addresses — the API answered {@code 409} and the suites went red
 * with no code change. {@link RunContext#processTag()} is the discriminator that fixes it, so it
 * gets checks that do not consult the generator: the format checks below would pass vacuously if
 * the tag were ever empty.
 *
 * <p>The cross-process property cannot be proved from inside one process. The pinned-run-id repro
 * and the CI run are what cover that.
 */
@Tag("smoke")
@DisplayName("Generated identity format")
class TestValuesTest {

  @Test
  @DisplayName("a generated email embeds the run id and the process tag, on a reserved domain")
  void shouldEmbedRunIdAndProcessTagWhenGeneratingAnEmail() {
    String email = TestValues.uniqueEmail();

    assertThat(email)
        .as("the af- prefix and the embedded run id are what let a janitor job find leftovers")
        .startsWith("af-" + RunContext.runId() + "-" + RunContext.processTag() + "-");
    assertThat(email)
        .as("generated addresses must never be able to deliver mail")
        .endsWith("@example.invalid");
  }

  @Test
  @DisplayName("a generated name keeps its caller's prefix ahead of the run-scoped part")
  void shouldEmbedPrefixRunIdAndProcessTagWhenGeneratingAName() {
    String name = TestValues.uniqueName("order");

    assertThat(name)
        .as("the prefix says what the record is and the rest says which process made it")
        .startsWith("order-af-" + RunContext.runId() + "-" + RunContext.processTag() + "-");
  }

  @Test
  @DisplayName("two calls in one process never return the same address")
  void shouldReturnADifferentAddressWhenCalledTwice() {
    String first = TestValues.uniqueEmail();
    String second = TestValues.uniqueEmail();

    assertThat(first).as("the run-scoped counter advances on every call").isNotEqualTo(second);
  }

  @Test
  @DisplayName("the process tag is present and safe to put in an email local part")
  void shouldBeNonEmptyAndSafeInAnEmailLocalPartWhenReadingTheProcessTag() {
    String tag = RunContext.processTag();

    assertThat(tag).as("the tag is what keeps two processes apart").isNotBlank();
    assertThat(tag).as("the random floor is 8 hex characters").hasSizeGreaterThanOrEqualTo(8);

    for (int i = 0; i < tag.length(); i++) {
      char character = tag.charAt(i);
      boolean allowed =
          (character >= 'a' && character <= 'z')
              || (character >= '0' && character <= '9')
              || character == '-';
      assertThat(allowed)
          .as("'" + character + "' is not safe in an email local part or a path")
          .isTrue();
    }
  }

  @Test
  @DisplayName("the process tag is minted once, so every value from one process carries it")
  void shouldReturnTheSameProcessTagWhenReadTwice() {
    assertThat(RunContext.processTag()).isEqualTo(RunContext.processTag());
  }

  @Test
  @DisplayName("no segment of a generated address is empty")
  void shouldHaveNoEmptySegmentWhenGeneratingAnEmail() {
    String email = TestValues.uniqueEmail();

    // An empty process tag would collapse to "af-{runId}--{n}" and would still satisfy a
    // startsWith check built from the same members, so assert the shape directly.
    assertThat(email)
        .as("an empty segment means a discriminator went missing")
        .doesNotContain("--");
  }
}
