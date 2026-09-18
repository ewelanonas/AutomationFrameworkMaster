using System.Net.Http.Json;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Clients;

/// <summary>
/// Authentication endpoints.
/// </summary>
/// <remarks>
/// The <see cref="HttpClient"/> is injected for the same reason as in <see cref="ProductsClient"/>: the
/// dependency stays visible and these remain instance methods rather than static helpers.
/// </remarks>
public sealed class AuthClient(HttpClient http)
{
    /// <summary>
    /// <c>POST /users/login</c>. Returns the result whatever the status — negative tests need that.
    /// </summary>
    public async Task<ApiResult<LoginResponse>> LoginAsync(LoginRequest loginRequest)
    {
        string loginPath = ConfigLoader.Config.Api.LoginPath.TrimStart('/');

        using HttpResponseMessage response = await http
            .PostAsJsonAsync(loginPath, loginRequest, ApiHttp.JsonOptions)
            .ConfigureAwait(false);

        return await ApiResult.OfAsync<LoginResponse>(response).ConfigureAwait(false);
    }

    /// <summary>Convenience for the common case.</summary>
    public Task<ApiResult<LoginResponse>> LoginAsync(string email, string password)
        => LoginAsync(LoginRequest.Of(email, password));

    /// <summary>
    /// <c>GET /users/me</c> with an explicit Authorization header, or without one when
    /// <paramref name="bearerHeaderValue"/> is null.
    /// </summary>
    /// <remarks>
    /// The nullable header is deliberate: the anonymous-access case is a first-class test, not an edge
    /// case, and it should not need a different method.
    /// </remarks>
    public async Task<ApiResult<NoBody>> CurrentUserAsync(string? bearerHeaderValue)
    {
        using HttpRequestMessage request = new(HttpMethod.Get, "users/me");
        if (bearerHeaderValue is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", bearerHeaderValue);
        }

        using HttpResponseMessage response = await http.SendAsync(request).ConfigureAwait(false);
        return await ApiResult.OfStatusOnlyAsync(response).ConfigureAwait(false);
    }
}
