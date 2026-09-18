using System.Globalization;
using Allure.NUnit;
using Allure.NUnit.Attributes;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;
using AwesomeAssertions;
using AwesomeAssertions.Execution;
using NUnit.Framework;

namespace AutomationFramework.Tests.Api;

/// <summary>
/// Catalogue read behaviour.
/// </summary>
/// <remarks>
/// Note what these tests do <b>not</b> assert: that the catalogue holds exactly 50 products. That number is
/// true today and is not part of any contract, so asserting it would produce a red suite the day someone
/// adds a product. The assertions target invariants instead — page size is respected, <c>from</c>/<c>to</c>
/// agree with the page contents, <c>last_page</c> follows from <c>total</c>, and no product appears on two
/// pages. Those hold regardless of how much data exists.
/// </remarks>
[TestFixture]
[AllureNUnit]
[Category("Regression")]
public sealed class ProductCatalogueApiTests : ApiTestBase
{
    [Test]
    [Category("Smoke")]
    [AllureIssue("TOOL-1")]
    [Description("Returns the first page of products with a consistent pagination envelope.")]
    public async Task ShouldReturnFirstPageWithConsistentEnvelope_WhenCatalogueIsListed()
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(1);

        result.Status.Should().Be(200, "listing the catalogue must succeed");

        PagedProducts page = result.Body!;

        using AssertionScope scope = new();
        page.CurrentPage.Should().Be(1, "the response echoes the requested page");
        page.PerPage.Should().BePositive("page size is advertised");
        page.Size.Should().BeLessThanOrEqualTo(
            page.PerPage, "a page never carries more items than the advertised page size");
        page.Total.Should().BePositive("total item count is advertised");
        page.From.Should().Be(1, "the first page starts at item 1");
        page.To.Should().Be(page.Size, "'to' agrees with the number of items actually returned");
        page.LastPage.Should().Be(
            ExpectedLastPage(page.Total, page.PerPage), "last_page follows from total and per_page");
    }

    [Test]
    [Category("Smoke")]
    [Description("Returns fully populated products rather than empty shells.")]
    public async Task ShouldReturnPopulatedProducts_WhenCatalogueIsListed()
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(1);
        result.Status.Should().Be(200);

        Product first = result.Body!.Data[0];

        using AssertionScope scope = new();
        first.Id.Should().NotBeNullOrWhiteSpace("id is present");
        first.Name.Should().NotBeNullOrWhiteSpace("name is present");
        first.Price.Should().BeGreaterThan(0m, "price is a positive amount");
        first.InStock.Should().NotBeNull("the stock flag is present");
        first.Category.Should().NotBeNull("category is expanded, not just an id");
        first.Brand.Should().NotBeNull("brand is expanded, not just an id");
        first.Category!.Name.Should().NotBeNullOrWhiteSpace("category name is present");
        first.Brand!.Name.Should().NotBeNullOrWhiteSpace("brand name is present");
    }

    [Test]
    [Description("Fetching a product by id returns the same product the listing showed.")]
    public async Task ShouldReturnRequestedProduct_WhenIdExists()
    {
        ApiResult<PagedProducts> listing = await Products.ListPageAsync(1);
        Product fromList = listing.Body!.Data[0];

        ApiResult<Product> result = await Products.GetByIdAsync(fromList.Id);

        result.Status.Should().Be(200);

        // Compared field by field, excluding Specs: the detail endpoint expands specifications and the
        // list endpoint omits them, so a whole-object comparison would fail on a real difference that is
        // not a defect. Category is excluded for the same reason — the detail response adds ParentId.
        result.Body!.Should().BeEquivalentTo(
            fromList,
            options => options.Excluding(product => product.Specs).Excluding(product => product.Category),
            "the same product must be represented consistently by both endpoints");
    }

    [Test]
    [Description("A well-formed id that matches nothing is a 404, not a 400 or a 500.")]
    public async Task ShouldReturnNotFound_WhenProductIdDoesNotExist()
    {
        ApiResult<Product> result = await Products.GetByIdAsync(TestValues.WellFormedButMissingId());

        result.Status.Should().Be(404, "a well-formed id that matches nothing is a 404");

        ApiError error = result.Error();
        error.Text().Should().NotBeNullOrWhiteSpace("the error explains what went wrong");
        AssertNoInternalDetailLeaked(result.RawBody);
    }

    [Test]
    [Description("Pagination must not lose or duplicate rows across pages.")]
    public async Task ShouldNotRepeatProducts_WhenPagingThroughCatalogue()
    {
        ApiResult<PagedProducts> firstResult = await Products.ListPageAsync(1);
        int pagesToCheck = Math.Min(firstResult.Body!.LastPage, 4);

        List<string> seenIds = [];

        for (int pageNumber = 1; pageNumber <= pagesToCheck; pageNumber++)
        {
            ApiResult<PagedProducts> result = await Products.ListPageAsync(pageNumber);
            result.Status.Should().Be(200, $"page {pageNumber} must load");

            foreach (string id in result.Body!.Ids())
            {
                seenIds.Should().NotContain(
                    id,
                    $"product {id} appeared on more than one page, so pagination is losing or "
                    + "duplicating rows");
                seenIds.Add(id);
            }
        }

        seenIds.Should().NotBeEmpty("the pages checked returned some products");
    }

    [Test]
    [Description("A page beyond the end is an empty result, not an error.")]
    public async Task ShouldReturnEmptyPage_WhenPageIsBeyondTheLastPage()
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(9999);

        using AssertionScope scope = new();
        result.Status.Should().Be(200, "a page beyond the end is an empty result, not an error");
        result.Body!.IsEmpty.Should().BeTrue("no items are returned");
        result.Body.From.Should().BeNull("'from' is null on an empty page");
        result.Body.To.Should().BeNull("'to' is null on an empty page");
    }

    [TestCase(1)]
    [TestCase(2)]
    [TestCase(3)]
    [Description("The response echoes the page number that was requested.")]
    public async Task ShouldEchoRequestedPageNumber_WhenPageIsRequested(int requestedPage)
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(requestedPage);

        result.Status.Should().Be(200);
        result.Body!.CurrentPage.Should().Be(requestedPage);
    }

    [Test]
    [Description("Search returns only products whose name matches the term.")]
    public async Task ShouldReturnOnlyMatchingProducts_WhenSearching()
    {
        const string Term = "Hammer";

        ApiResult<PagedProducts> result = await Products.SearchAsync(Term);

        result.Status.Should().Be(200);
        result.Body!.IsEmpty.Should().BeFalse("the demo catalogue contains hammers");

        // A loop rather than a LINQ predicate: every reader can follow it, and the failure message names
        // the offending product instead of reporting that some predicate was false.
        foreach (Product product in result.Body.Data)
        {
            product.Name.Should().ContainEquivalentOf(
                Term,
                $"search returned '{product.Name}', which does not match the term '{Term}'");
        }
    }

    [Test]
    [Description("A search matching nothing is an empty success, not a 404.")]
    public async Task ShouldReturnEmptyResult_WhenSearchMatchesNothing()
    {
        string term = TestValues.UniqueName("no-such-product");

        ApiResult<PagedProducts> result = await Products.SearchAsync(term);

        using AssertionScope scope = new();
        result.Status.Should().Be(200, "no matches is an empty success, not a 404");
        result.Body!.IsEmpty.Should().BeTrue("nothing matched");
        result.Body.Total.Should().Be(0, "total reflects the empty result");
    }

    private static int ExpectedLastPage(int total, int perPage)
    {
        if (total == 0)
        {
            return 1;
        }

        int fullPages = total / perPage;
        return total % perPage == 0 ? fullPages : fullPages + 1;
    }

    /// <summary>
    /// An error body must not hand an attacker a map of the implementation.
    /// </summary>
    /// <remarks>
    /// Kept next to the tests that need it rather than in a shared base class, so the rule it enforces is
    /// visible at the point of use.
    /// </remarks>
    internal static void AssertNoInternalDetailLeaked(string rawBody)
    {
        string lower = rawBody.ToLower(CultureInfo.InvariantCulture);

        string[] forbidden =
        [
            "exception",
            "stack trace",
            "   at ",
            "sqlstate",
            "select * from",
            "/var/www",
        ];

        foreach (string marker in forbidden)
        {
            lower.Should().NotContain(
                marker,
                $"the error body leaks an internal detail ('{marker}'), which helps an attacker");
        }
    }
}
