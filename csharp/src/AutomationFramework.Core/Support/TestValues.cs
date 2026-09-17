using System.Globalization;
using Bogus;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Generated values that are unique per run and reproducible on demand.
/// </summary>
/// <remarks>
/// The generator is seeded, and the seed is logged. Without that, a failure caused by a particular
/// generated value can never be reproduced: you get a red test, a re-run that passes, and no
/// explanation. Set <c>AF_DATA_SEED</c> to the logged value to replay a run's data exactly.
/// <para>
/// Generated identities use reserved test domains only. A real domain in test data eventually means
/// real email sent to a real person.
/// </para>
/// </remarks>
public static class TestValues
{
    private static readonly int Seed = ResolveSeed();

    private static readonly ThreadLocal<Faker> LocalFaker = new(() => new Faker
    {
        Random = new Randomizer(Seed),
    });

    static TestValues()
    {
        TestLog.Info(
            $"Test data seed: {Seed}. Set AF_DATA_SEED={Seed} to reproduce this run's generated data.");
    }

    /// <summary>Generator for the current thread. Seeded, so two threads produce the same stream independently.</summary>
    public static Faker Faker => LocalFaker.Value!;

    /// <summary>Unique, run-scoped email on a reserved domain that cannot deliver mail.</summary>
    public static string UniqueEmail()
        => string.Create(
            CultureInfo.InvariantCulture,
            $"af-{RunContext.RunId}-{RunContext.NextSequence()}@example.invalid");

    /// <summary>Unique, run-scoped name prefixed so a janitor job can find leftovers.</summary>
    public static string UniqueName(string prefix)
        => string.Create(
            CultureInfo.InvariantCulture,
            $"{prefix}-af-{RunContext.RunId}-{RunContext.NextSequence()}");

    /// <summary>
    /// An id that is syntactically valid for the target API but certain not to exist.
    /// </summary>
    /// <remarks>
    /// Shaped as a 26-character ULID because the demo API rejects anything else before it gets as far as
    /// looking the record up, which would test the wrong thing. A 404 test has to send an id the service
    /// accepts as well formed.
    /// </remarks>
    public static string WellFormedButMissingId() => "0AF00000000000000000000000";

    /// <summary>
    /// The seed for this run: <c>AF_DATA_SEED</c> when set, otherwise a fresh random one.
    /// </summary>
    /// <remarks>
    /// A fixed default would be worse than random. It would hide the whole class of bug where a test
    /// only passes for one particular generated value, because every run would use that same value.
    /// </remarks>
    private static int ResolveSeed()
    {
        string? fromEnvironment = Environment.GetEnvironmentVariable("AF_DATA_SEED");
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            if (int.TryParse(
                    fromEnvironment.Trim(),
                    NumberStyles.Integer,
                    CultureInfo.InvariantCulture,
                    out int parsed))
            {
                return parsed;
            }

            throw new InvalidOperationException(
                $"AF_DATA_SEED must be a whole number, but was '{fromEnvironment}'.");
        }

        return Random.Shared.Next();
    }
}
