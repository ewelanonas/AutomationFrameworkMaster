using System.Net.Http.Json;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Clients;

/// <summary>User account endpoints.</summary>
public sealed class UsersClient(HttpClient http)
{
    /// <summary><c>POST /users/register</c>. Returns the result whatever the status.</summary>
    public async Task<ApiResult<NoBody>> RegisterAsync(RegisterRequest registerRequest)
    {
        using HttpResponseMessage response = await http
            .PostAsJsonAsync("users/register", registerRequest, ApiHttp.JsonOptions)
            .ConfigureAwait(false);

        return await ApiResult.OfStatusOnlyAsync(response).ConfigureAwait(false);
    }
}
