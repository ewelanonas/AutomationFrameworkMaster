using System.Text;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;
using Microsoft.Playwright;

namespace AutomationFramework.Core.Flows;

/// <summary>
/// Gets a browser into a signed-in state without touching the login form.
/// </summary>
/// <remarks>
/// This is the single highest-value flow in a UI suite. Signing in through the form before every test is
/// usually the largest waste of time in the whole run, and it makes every test depend on the login screen
/// working. Here the token is obtained over the API and injected into the browser, so only the tests that
/// are genuinely <i>about</i> logging in ever use the form.
/// <para>
/// The injection target was verified against the running application: it keeps its JWT in
/// <c>localStorage</c> under the key <c>auth-token</c>, storing the raw token string with no wrapper.
/// <c>AddInitScriptAsync</c> installs it before any page script runs, so the app is already authenticated
/// on first paint and there is no logged-out flash to race against.
/// </para>
/// </remarks>
public sealed class AuthFlow(AuthClient authClient)
{
    private const string TokenStorageKey = "auth-token";

    /// <summary>
    /// Signs in over the API and seeds the token into the context.
    /// </summary>
    /// <returns>The token, for tests that also need to call the API as this user.</returns>
    /// <exception cref="InvalidOperationException">
    /// Thrown when the credentials are rejected. Failing here, with the status, is far clearer than letting
    /// every later assertion fail against a logged-out page.
    /// </exception>
    public async Task<string> SignInViaApiAsync(IBrowserContext context, string email, string password)
    {
        // Logged rather than recorded as an Allure step. See the comment in AccountFlow.CreateCustomerAsync.
        TestLog.Info($"Signing in as {email} via the API and seeding the browser session");

        ApiResult<LoginResponse> result = await authClient.LoginAsync(email, password)
            .ConfigureAwait(false);

        if (!result.IsSuccessful || result.Body is null)
        {
            throw new InvalidOperationException(
                $"Could not sign in as {email} to set up the test. The API returned {result.Status}. "
                + "Check AF_AUTH_USERNAME and AF_AUTH_PASSWORD.");
        }

        string token = result.Body.AccessToken;
        await SeedTokenAsync(context, token).ConfigureAwait(false);
        return token;
    }

    /// <summary>
    /// Writes the token into <c>localStorage</c> for every page this context opens.
    /// </summary>
    /// <remarks>
    /// Uses an init script rather than navigating and then evaluating, so the value is present before the
    /// application boots.
    /// </remarks>
    public static async Task SeedTokenAsync(IBrowserContext context, string token)
    {
        string script =
            $"window.localStorage.setItem('{TokenStorageKey}', {ToJavaScriptStringLiteral(token)});";

        await context.AddInitScriptAsync(script).ConfigureAwait(false);
    }

    /// <summary>Clears the seeded session, for a test that needs to start signed out in an existing context.</summary>
    public static async Task ClearSessionAsync(IBrowserContext context)
    {
        await context.ClearCookiesAsync().ConfigureAwait(false);
        await context.AddInitScriptAsync(
            $"window.localStorage.removeItem('{TokenStorageKey}');").ConfigureAwait(false);
    }

    /// <summary>
    /// Quotes a value for safe inclusion in a JavaScript source string.
    /// </summary>
    /// <remarks>
    /// A token is opaque and could in principle contain a quote or a backslash. Concatenating it into script
    /// text unescaped is the same class of mistake as string-building SQL, so it is escaped here rather than
    /// trusted.
    /// </remarks>
    private static string ToJavaScriptStringLiteral(string value)
    {
        StringBuilder builder = new("'");

        foreach (char character in value)
        {
            if (character is '\'' or '\\')
            {
                builder.Append('\\').Append(character);
            }
            else if (character == '\n')
            {
                builder.Append("\\n");
            }
            else if (character == '\r')
            {
                builder.Append("\\r");
            }
            else
            {
                builder.Append(character);
            }
        }

        return builder.Append('\'').ToString();
    }
}
