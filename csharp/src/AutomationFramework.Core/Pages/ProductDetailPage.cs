using System.Globalization;
using AutomationFramework.Core.Support;
using Microsoft.Playwright;

namespace AutomationFramework.Core.Pages;

/// <summary>
/// A single product's detail page.
/// </summary>
/// <remarks>
/// Worth noting for anyone writing assertions: the price here renders <b>without</b> a currency symbol
/// (<c>14.15</c>), while the catalogue card renders <b>with</b> one (<c>$14.15</c>). Two different
/// elements, two different formats. Both were read from the live pages.
/// </remarks>
public sealed class ProductDetailPage
{
    private const string PathPrefix = "/product/";

    private readonly IPage _page;

    public ProductDetailPage(IPage page)
    {
        _page = page;
        ProductName = page.GetByTestId("product-name");
        UnitPrice = page.GetByTestId("unit-price");
        Description = page.GetByTestId("product-description");
        Co2RatingBadge = page.GetByTestId("co2-rating-badge");
        QuantityInput = page.GetByTestId("quantity");
        IncreaseQuantity = page.GetByTestId("increase-quantity");
        DecreaseQuantity = page.GetByTestId("decrease-quantity");
        AddToCartButton = page.GetByTestId("add-to-cart");
        AddToFavoritesButton = page.GetByTestId("add-to-favorites");
        SpecificationsTable = page.GetByTestId("product-specs");
    }

    public ILocator ProductName { get; }

    public ILocator UnitPrice { get; }

    public ILocator Description { get; }

    public ILocator Co2RatingBadge { get; }

    public ILocator QuantityInput { get; }

    public ILocator IncreaseQuantity { get; }

    public ILocator DecreaseQuantity { get; }

    public ILocator AddToCartButton { get; }

    public ILocator AddToFavoritesButton { get; }

    public ILocator SpecificationsTable { get; }

    /// <summary>Opens a product directly by id, skipping the catalogue.</summary>
    public async Task<ProductDetailPage> OpenAsync(string productId)
    {
        await Navigation.ToAsync(_page, PathPrefix + productId).ConfigureAwait(false);
        return this;
    }

    public async Task<ProductDetailPage> SetQuantityAsync(int quantity)
    {
        await QuantityInput.FillAsync(quantity.ToString(CultureInfo.InvariantCulture))
            .ConfigureAwait(false);
        return this;
    }

    public async Task<ProductDetailPage> IncreaseQuantityByAsync(int times)
    {
        for (int i = 0; i < times; i++)
        {
            await IncreaseQuantity.ClickAsync().ConfigureAwait(false);
        }

        return this;
    }

    public async Task<ProductDetailPage> AddToCartAsync()
    {
        await AddToCartButton.ClickAsync().ConfigureAwait(false);
        return this;
    }

    /// <summary>The specification value cell for a named row, for example <c>Weight</c>.</summary>
    public ILocator SpecificationValue(string specificationName)
        => SpecificationsTable
            .Locator("[data-test='spec-row']")
            .Filter(new LocatorFilterOptions { HasText = specificationName })
            .Locator("[data-test='spec-value']");

    /// <summary>
    /// All specification row names, in display order.
    /// </summary>
    /// <remarks>
    /// Resolved in one call, for the same reason as <c>HomePage.VisibleProductNamesAsync</c>: indexing
    /// after a separate count is a race whenever the table can re-render.
    /// </remarks>
    public async Task<List<string>> SpecificationNamesAsync()
    {
        ILocator cells = SpecificationsTable.Locator("[data-test='spec-name']");
        IReadOnlyList<string> texts = await cells.AllInnerTextsAsync().ConfigureAwait(false);

        List<string> names = [];
        foreach (string text in texts)
        {
            names.Add(text.Trim());
        }

        return names;
    }
}
