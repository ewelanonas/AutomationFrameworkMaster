using System.Globalization;
using System.Net.Http.Json;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;

namespace AutomationFramework.Core.Clients;

/// <summary>
/// Catalogue endpoints.
/// </summary>
/// <remarks>
/// One method per operation. No assertions, no status checks, no business logic — those belong to the
/// test. Query and path values are escaped rather than concatenated raw into a URL.
/// <para>
/// The <see cref="HttpClient"/> is injected rather than read from a static. That keeps the dependency
/// visible, lets a test point one client at a different base address, and means these are genuinely
/// instance methods instead of static helpers wearing a class as a hat.
/// </para>
/// </remarks>
public sealed class ProductsClient(HttpClient http)
{
    private const string Products = "products";

    /// <summary><c>GET /products?page=n</c></summary>
    public async Task<ApiResult<PagedProducts>> ListPageAsync(int page)
    {
        string path = string.Create(CultureInfo.InvariantCulture, $"{Products}?page={page}");
        using HttpResponseMessage response = await http.GetAsync(path).ConfigureAwait(false);
        return await ApiResult.OfAsync<PagedProducts>(response).ConfigureAwait(false);
    }

    /// <summary><c>GET /products/{id}</c></summary>
    public async Task<ApiResult<Product>> GetByIdAsync(string productId)
    {
        string path = $"{Products}/{Uri.EscapeDataString(productId)}";
        using HttpResponseMessage response = await http.GetAsync(path).ConfigureAwait(false);
        return await ApiResult.OfAsync<Product>(response).ConfigureAwait(false);
    }

    /// <summary><c>GET /products/search?q=...</c></summary>
    public async Task<ApiResult<PagedProducts>> SearchAsync(string query)
    {
        string path = $"{Products}/search?q={Uri.EscapeDataString(query)}";
        using HttpResponseMessage response = await http.GetAsync(path).ConfigureAwait(false);
        return await ApiResult.OfAsync<PagedProducts>(response).ConfigureAwait(false);
    }

    /// <summary><c>GET /products?by_brand=&lt;brandId&gt;</c></summary>
    public async Task<ApiResult<PagedProducts>> ListByBrandAsync(string brandId)
    {
        string path = $"{Products}?by_brand={Uri.EscapeDataString(brandId)}";
        using HttpResponseMessage response = await http.GetAsync(path).ConfigureAwait(false);
        return await ApiResult.OfAsync<PagedProducts>(response).ConfigureAwait(false);
    }

    /// <summary>
    /// <c>POST /products</c> — creation requires an admin token.
    /// </summary>
    /// <remarks>
    /// Present so the authorization boundary can be tested: the same call with no token, with a customer
    /// token, and with an admin token must behave differently. The header is nullable so the anonymous
    /// case does not need a separate method.
    /// </remarks>
    public async Task<ApiResult<Product>> CreateAsync(string? bearerHeaderValue, object payload)
    {
        using HttpRequestMessage request = new(HttpMethod.Post, Products)
        {
            Content = JsonContent.Create(payload, options: ApiHttp.JsonOptions),
        };

        if (bearerHeaderValue is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", bearerHeaderValue);
        }

        using HttpResponseMessage response = await http.SendAsync(request).ConfigureAwait(false);
        return await ApiResult.OfAsync<Product>(response).ConfigureAwait(false);
    }

    /// <summary><c>DELETE /products/{id}</c> — tolerates an already-deleted record, for use in cleanup.</summary>
    public async Task<ApiResult<NoBody>> DeleteIgnoringMissingAsync(
        string bearerHeaderValue,
        string productId)
    {
        string path = $"{Products}/{Uri.EscapeDataString(productId)}";
        using HttpRequestMessage request = new(HttpMethod.Delete, path);
        request.Headers.TryAddWithoutValidation("Authorization", bearerHeaderValue);

        using HttpResponseMessage response = await http.SendAsync(request).ConfigureAwait(false);
        return await ApiResult.OfStatusOnlyAsync(response).ConfigureAwait(false);
    }
}
