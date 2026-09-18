using Allure.Net.Commons;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Flows;

/// <summary>
/// Creates disposable accounts over the API so no test depends on a shared one.
/// </summary>
/// <remarks>
/// This flow exists because of a failure this suite actually caused. The negative sign-in tests send a wrong
/// password on purpose. Against the shared demo account that incremented a server-side failed-attempt
/// counter until the account locked, and the API began answering <c>423 Locked</c> to <i>every</i> login â€”
/// including the happy paths, in both this module and the Java one.
/// <para>
/// The account lockout was not a bug in the application. It was a test-design defect: a shared account is
/// shared mutable state, and the house rules say tests own the data they need. A per-test account can be
/// locked, abused, or left in any state at all, because nothing else will ever use it.
/// </para>
/// <para>
/// The accounts are not deleted afterwards: the demo API offers no self-delete, and every generated address
/// is on <c>example.invalid</c> with the run id embedded, so a janitor can find them. In a real project this
/// flow would register cleanup at creation time.
/// </para>
/// </remarks>
public sealed class AccountFlow(UsersClient usersClient)
{
    /// <summary>
    /// Registers a fresh customer account and returns its credentials.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// Thrown when registration is refused. Failing here with the status is far clearer than letting every
    /// later assertion fail against a sign-in that could never have worked.
    /// </exception>
    public async Task<TestAccount> CreateCustomerAsync()
    {
        // Logged rather than recorded as an Allure step. The bare AllureApi.Step(name) overload starts a step
        // that nothing closes, and calling it from a flow left the suite hanging with no output at all. Report
        // step structure is worth having, but not at the cost of a suite that cannot finish â€” see the
        // "Known gaps" section of csharp/README.md.
        TestLog.Info("Registering a disposable customer account via the API");

        string email = TestValues.UniqueEmail();

        // Fixed rather than generated: the password must satisfy the application's complexity rules, and a
        // random one that occasionally fails them would produce a flaky setup step. It is a throwaway
        // credential for a throwaway account on a public sandbox.
        const string Password = "Str0ng-Pass!123";

        RegisterRequest request = new(
            FirstName: "Af",
            LastName: "Tester",
            Address: new PostalAddress("1 Test Street", "Testville", "TS", "PH", "1000"),
            Phone: "0000000000",
            DateOfBirth: "1990-01-01",
            Email: email,
            Password: Password);

        ApiResult<NoBody> result = await usersClient.RegisterAsync(request).ConfigureAwait(false);

        if (!result.IsSuccessful)
        {
            throw new InvalidOperationException(
                $"Could not register a test account ({result.Status}). Body: {result.RawBody}");
        }

        TestLog.Info($"Registered disposable account {email}");
        return new TestAccount(email, Password);
    }
}
