using Microsoft.Playwright;

namespace AutomationFramework.Core.Support;

/// <summary>
/// The single navigation policy every page object uses.
/// </summary>
/// <remarks>
/// Centralised for the same reason the timeout policy is: when navigation behaviour needs to change, it
/// should change in one place rather than in every page object.
/// <para>
/// The policy waits for <c>DOMContentLoaded</c> rather than the default <c>Load</c>. Against a single-page
/// application that difference matters. <c>Load</c> waits for every subresource, and this application's
/// client-side router frequently supersedes the initial navigation before those finish — which surfaces as
/// <c>net::ERR_ABORTED</c> on a page that in fact rendered perfectly well. That failure is a race in the
/// waiting strategy, not a defect in the application, and weakening the assertion or retrying the navigation
/// would have hidden it rather than fixed it.
/// </para>
/// <para>
/// Waiting for the DOM is not a shortcut that risks acting on an unready page: every interaction afterwards
/// goes through an auto-waiting locator, so the element-level waits do the real work.
/// </para>
/// </remarks>
public static class Navigation
{
    /// <summary>Navigates to a path relative to the configured base URL.</summary>
    public static async Task ToAsync(IPage page, string path)
    {
        await page.GotoAsync(path, new PageGotoOptions
        {
            WaitUntil = WaitUntilState.DOMContentLoaded,
            Timeout = ConfigLoader.Config.Timeouts.NavigationMs,
        }).ConfigureAwait(false);
    }
}
