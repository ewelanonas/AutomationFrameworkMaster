using System.Globalization;
using Allure.NUnit;
using Allure.NUnit.Attributes;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Pages;
using AwesomeAssertions;
using Microsoft.Playwright;
using NUnit.Framework;

namespace AutomationFramework.Tests.Ui;

/// <summary>
/// Browsing the catalogue in a real browser.
/// </summary>
/// <remarks>
/// Only behaviour that genuinely needs a browser lives here. The search <i>rules</i> are covered far more
/// cheaply and thoroughly in <c>ProductCatalogueApiTests</c>; what this class checks is that the page
/// renders what the API returned, and that navigation works.
/// <para>
/// Two assertion styles appear side by side, on purpose. <c>Assertions.Expect(locator)</c> is Playwright's
/// web-first assertion: it retries until the condition holds or the timeout expires, which is what makes
/// explicit waits unnecessary. AwesomeAssertions' <c>Should()</c> is for plain values that are already in
/// hand and need no retry.
/// </para>
/// </remarks>
[TestFixture]
[AllureNUnit]
[Category("Regression")]
public sealed class ProductBrowsingTests : UiTestBase
{
    [Test]
    [Category("Smoke")]
    [AllureIssue("TOOL-2")]
    [Description("Searching by name shows only matching products.")]
    public async Task ShouldShowOnlyMatchingProducts_WhenSearchingByName()
    {
        const string Term = "Hammer";
        HomePage home = new(Page);
        await home.OpenAsync();

        await home.SearchAsync(Term);

        // Two web-first assertions, in this order, and the second one matters.
        //
        // ToBeVisibleAsync alone passes immediately, because the pre-search grid is already on screen.
        // Reading the names straight after it enumerates a grid that is still mid-re-render, which is a
        // race. ContainTextAsync retries until the first card is actually a search result, which is the
        // observable signal that the re-render finished. No sleep, and nothing to tune.
        await Assertions.Expect(home.ProductNames.First).ToBeVisibleAsync();
        await Assertions.Expect(home.ProductNames.First).ToContainTextAsync(Term);

        List<string> shown = await home.VisibleProductNamesAsync();
        shown.Should().NotBeEmpty("the search returned something to check");

        foreach (string name in shown)
        {
            name.Should().ContainEquivalentOf(
                Term, $"the grid shows '{name}', which does not match the search term '{Term}'");
        }
    }

    [Test]
    [Category("Smoke")]
    [Description("The detail page shows the same name and price the card showed.")]
    public async Task ShouldOpenDetailPage_MatchingTheCard()
    {
        Product expected = await FirstProductFromApiAsync();

        HomePage home = new(Page);
        await home.OpenAsync();
        ProductDetailPage detail = await home.OpenProductAsync(expected.Id);

        // The card renders the price with a currency symbol, the detail page without one. Both were read
        // from the live pages; asserting the detail page's format here is deliberate, not an oversight.
        await Assertions.Expect(detail.ProductName).ToHaveTextAsync(expected.Name);
        await Assertions.Expect(detail.UnitPrice)
            .ToHaveTextAsync(expected.Price.ToString(CultureInfo.InvariantCulture));
    }

    [Test]
    [Description("A product detail page lists its specifications.")]
    public async Task ShouldRenderSpecifications_WhenProductIsOpened()
    {
        Product expected = await FirstProductFromApiAsync();

        ProductDetailPage detail = new(Page);
        await detail.OpenAsync(expected.Id);

        await Assertions.Expect(detail.SpecificationsTable).ToBeVisibleAsync();

        List<string> specificationNames = await detail.SpecificationNamesAsync();
        specificationNames.Should().NotBeEmpty("a product detail page lists its specifications");
    }

    [Test]
    [Description("The second page of results does not repeat products from the first.")]
    public async Task ShouldMoveToSecondPage_WithoutRepeatingProducts()
    {
        HomePage home = new(Page);
        await home.OpenAsync();

        await Assertions.Expect(home.ProductNames.First).ToBeVisibleAsync();
        List<string> firstPageNames = await home.VisibleProductNamesAsync();

        await home.GoToNextPageAsync();

        // Waiting on the observable change rather than on time: the first name differs once the new page
        // has rendered. Playwright retries the assertion until it does or the timeout expires.
        await Assertions.Expect(home.ProductNames.First).Not.ToHaveTextAsync(firstPageNames[0]);

        List<string> secondPageNames = await home.VisibleProductNamesAsync();
        secondPageNames.Should().NotIntersectWith(
            firstPageNames, "the second page must not repeat products from the first");
    }

    [Test]
    [Description("The catalogue loads without logging an unexpected browser console error.")]
    public async Task ShouldLoadCatalogue_WithoutUnexpectedConsoleErrors()
    {
        HomePage home = new(Page);
        await home.OpenAsync();
        await Assertions.Expect(home.ProductNames.First).ToBeVisibleAsync();

        // A page that renders correctly while throwing in the console is a real defect that functional
        // assertions never notice. Asserted as its own test so a console regression is not attributed to an
        // unrelated failure.
        //
        // Filtered through ConsoleErrorPolicy rather than asserted empty. The live application fires an
        // authenticated request on the anonymous catalogue page and logs the resulting 401 on every load.
        // A blanket empty assertion would be red on every run and would get deleted within a week, taking
        // the useful part of the check with it.
        SignificantConsoleErrors().Should().BeEmpty(
            "the catalogue page logged a console error that is not on the reviewed allowlist in "
            + "ConsoleErrorPolicy. Either the page has a new defect, or the allowlist needs a new entry "
            + "with a documented reason");
    }

    /// <summary>
    /// Fetches a product over the API to use as the expectation.
    /// </summary>
    /// <remarks>
    /// Preconditions and expected values come from the API, never from reading them off the page first. A UI
    /// test that derives its expectation from the same page it is checking proves only that the page agrees
    /// with itself.
    /// </remarks>
    private async Task<Product> FirstProductFromApiAsync()
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(1);
        result.Status.Should().Be(200, "the catalogue API must be reachable to set up this test");
        return result.Body!.Data[0];
    }
}
