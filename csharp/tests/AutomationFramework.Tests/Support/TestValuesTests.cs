using Allure.NUnit;
using AutomationFramework.Core.Support;
using AwesomeAssertions;
using NUnit.Framework;

namespace AutomationFramework.Tests.Support;

/// <summary>
/// The shape of a generated identity, checked without touching the network.
/// </summary>
/// <remarks>
/// These exist because of a CI failure. Both module jobs of one workflow run resolved the same run id
/// from <c>GITHUB_RUN_ID</c>, each restarted its own counter at 1, and the second job re-registered the
/// first job's addresses — the API answered <c>409</c> and the suites went red with no code change.
/// <see cref="RunContext.ProcessTag"/> is the discriminator that fixes it, so it gets checks that do not
/// consult the generator: the format checks below would pass vacuously if the tag were ever empty.
/// <para>
/// The cross-process property cannot be proved from inside one process. The pinned-run-id repro in
/// <c>.agents</c> and the CI run are what cover that.
/// </para>
/// </remarks>
[TestFixture]
[AllureNUnit]
[Category("Smoke")]
public sealed class TestValuesTests
{
    [Test]
    [Category("Smoke")]
    [Description("A generated email embeds the run id and the process tag, on a reserved domain.")]
    public void UniqueEmail_ShouldEmbedRunIdAndProcessTag()
    {
        string email = TestValues.UniqueEmail();

        email.Should().StartWith(
            $"af-{RunContext.RunId}-{RunContext.ProcessTag}-",
            "the af- prefix and the embedded run id are what let a janitor job find leftovers");
        email.Should().EndWith(
            "@example.invalid", "generated addresses must never be able to deliver mail");
    }

    [Test]
    [Category("Smoke")]
    [Description("A generated name keeps its caller's prefix ahead of the run-scoped part.")]
    public void UniqueName_ShouldEmbedPrefixRunIdAndProcessTag()
    {
        string name = TestValues.UniqueName("order");

        name.Should().StartWith(
            $"order-af-{RunContext.RunId}-{RunContext.ProcessTag}-",
            "the prefix says what the record is and the rest says which process made it");
    }

    [Test]
    [Category("Smoke")]
    [Description("Two calls in one process never return the same address.")]
    public void UniqueEmail_ShouldDifferBetweenCalls()
    {
        string first = TestValues.UniqueEmail();
        string second = TestValues.UniqueEmail();

        first.Should().NotBe(second, "the run-scoped counter advances on every call");
    }

    [Test]
    [Category("Smoke")]
    [Description("The process tag is present and safe to put in an email local part.")]
    public void ProcessTag_ShouldBeNonEmptyAndSafeInAnEmailLocalPart()
    {
        string tag = RunContext.ProcessTag;

        tag.Should().NotBeNullOrWhiteSpace("the tag is what keeps two processes apart");
        tag.Length.Should().BeGreaterThanOrEqualTo(8, "the random floor is 8 hex characters");

        foreach (char character in tag)
        {
            bool allowed = char.IsAsciiLetterLower(character)
                || char.IsAsciiDigit(character)
                || character == '-';
            allowed.Should().BeTrue($"'{character}' is not safe in an email local part or a path");
        }
    }

    [Test]
    [Category("Smoke")]
    [Description("The process tag is minted once, so every value from one process carries the same tag.")]
    public void ProcessTag_ShouldBeMintedOncePerProcess()
    {
        RunContext.ProcessTag.Should().Be(RunContext.ProcessTag);
    }

    [Test]
    [Category("Smoke")]
    [Description("No segment of a generated address is empty.")]
    public void UniqueEmail_ShouldHaveNoEmptySegment()
    {
        string email = TestValues.UniqueEmail();

        // An empty process tag would collapse to "af-{runId}--{n}" and would still satisfy a
        // StartWith check built from the same members, so assert the shape directly.
        email.Should().NotContain("--", "an empty segment means a discriminator went missing");
    }
}
