using AutomationFramework.Core.Support;
using Microsoft.Playwright;

namespace AutomationFramework.Core.Pages;

/// <summary>
/// The catalogue landing page: search, sort, filters, product grid, pagination.
/// </summary>
/// <remarks>
/// Locators are built once in the constructor and exposed as properties. No assertions live here, so this
/// page object is equally usable by a test expecting results and one expecting none.
/// <para>
/// Every locator uses <c>GetByTestId</c>, which resolves against the <c>data-test</c> attribute configured
/// in <c>shared/environments/local.json</c>. They were read from the live page's DOM, not guessed.
/// </para>
/// </remarks>
public sealed class HomePage
{
    private readonly IPage _page;

    public HomePage(IPage page)
    {
        _page = page;
        SearchInput = page.GetByTestId("search-query");
        SearchSubmit = page.GetByTestId("search-submit");
        SearchReset = page.GetByTestId("search-reset");
        SortSelect = page.GetByTestId("sort");
        ProductNames = page.GetByTestId("product-name");
        ProductPrices = page.GetByTestId("product-price");
        PaginationNext = page.GetByTestId("pagination-next");
        PaginationPrevious = page.GetByTestId("pagination-prev");
        SignInLink = page.GetByTestId("nav-sign-in");
        EcoFriendlyFilter = page.GetByTestId("eco-friendly-filter");
    }

    public ILocator SearchInput { get; }

    public ILocator SearchSubmit { get; }

    public ILocator SearchReset { get; }

    public ILocator SortSelect { get; }

    public ILocator ProductNames { get; }

    public ILocator ProductPrices { get; }

    public ILocator PaginationNext { get; }

    public ILocator PaginationPrevious { get; }

    public ILocator SignInLink { get; }

    public ILocator EcoFriendlyFilter { get; }

    /// <summary>Opens the catalogue. The base URL comes from config, so no absolute URL appears here.</summary>
    public async Task<HomePage> OpenAsync()
    {
        await Navigation.ToAsync(_page, "/").ConfigureAwait(false);
        return this;
    }

    /// <summary>Runs a search. Results render in place, so this returns the same page object.</summary>
    public async Task<HomePage> SearchAsync(string query)
    {
        await SearchInput.FillAsync(query).ConfigureAwait(false);
        await SearchSubmit.ClickAsync().ConfigureAwait(false);
        return this;
    }

    /// <summary>Clears the current search.</summary>
    public async Task<HomePage> ResetSearchAsync()
    {
        await SearchReset.ClickAsync().ConfigureAwait(false);
        return this;
    }

    /// <summary>A single product card, addressed by product id.</summary>
    public ILocator ProductCard(string productId) => _page.GetByTestId("product-" + productId);

    /// <summary>The out-of-stock badge inside a given card. Absent when the product is in stock.</summary>
    public ILocator OutOfStockBadgeIn(string productId)
        => ProductCard(productId).GetByTestId("out-of-stock");

    /// <summary>Opens a product's detail page by clicking its card.</summary>
    public async Task<ProductDetailPage> OpenProductAsync(string productId)
    {
        await ProductCard(productId).ClickAsync().ConfigureAwait(false);
        return new ProductDetailPage(_page);
    }

    /// <summary>Goes to the sign-in page.</summary>
    public async Task<LoginPage> OpenSignInAsync()
    {
        await SignInLink.ClickAsync().ConfigureAwait(false);
        return new LoginPage(_page);
    }

    /// <summary>Moves to the next page of results.</summary>
    public async Task<HomePage> GoToNextPageAsync()
    {
        await PaginationNext.ClickAsync().ConfigureAwait(false);
        return this;
    }

    /// <summary>Selects a sort option by its visible label, for example <c>Name (A - Z)</c>.</summary>
    public async Task<HomePage> SortByAsync(string visibleLabel)
    {
        await SortSelect.SelectOptionAsync(new SelectOptionValue { Label = visibleLabel })
            .ConfigureAwait(false);
        return this;
    }

    /// <summary>Number of product cards currently rendered.</summary>
    public Task<int> VisibleProductCountAsync() => ProductNames.CountAsync();

    /// <summary>
    /// Visible product names in display order.
    /// </summary>
    /// <remarks>
    /// Uses <c>AllInnerTextsAsync()</c>, which resolves the whole set in one call, rather than reading
    /// <c>CountAsync()</c> and then indexing with <c>Nth(i)</c>.
    /// <para>
    /// That difference is not stylistic. The count-then-index version has a race: the count is taken
    /// against the grid as it is now, and if the grid re-renders mid-loop â€” which it does after a search or
    /// a page change â€” <c>Nth(i)</c> waits for an element that no longer exists and the test times out.
    /// The Java module in this repo hit exactly that failure before the same fix.
    /// </para>
    /// </remarks>
    public async Task<List<string>> VisibleProductNamesAsync()
    {
        IReadOnlyList<string> texts = await ProductNames.AllInnerTextsAsync().ConfigureAwait(false);

        List<string> names = [];
        foreach (string text in texts)
        {
            names.Add(text.Trim());
        }

        return names;
    }
}
