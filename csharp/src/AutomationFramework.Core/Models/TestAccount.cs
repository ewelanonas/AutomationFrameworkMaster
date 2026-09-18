using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Models;

/// <summary>
/// An account this test run created and therefore owns.
/// </summary>
/// <remarks>
/// Owning the account is the whole point. A test that needs to send a wrong password — to check the
/// rejection, or that the message does not reveal whether the account exists — increments a server-side
/// failed-attempt counter. On a shared account that counter eventually trips a lockout and takes the entire
/// suite down with it, including every happy path.
/// <para>
/// With a per-test account, locking it costs nothing: nobody else will ever use it again.
/// </para>
/// <para>
/// <c>ToString</c> is overridden because this record carries a password.
/// </para>
/// </remarks>
public sealed record TestAccount(string Email, string Password)
{
    public override string ToString()
        => $"TestAccount {{ Email = {Email}, Password = {Redaction.Marker} }}";
}
