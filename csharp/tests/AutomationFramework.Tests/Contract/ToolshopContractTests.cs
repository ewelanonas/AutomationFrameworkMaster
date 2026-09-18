using Allure.NUnit;
using AutomationFramework.Core.Clients;
using AutomationFramework.Core.Models;
using AutomationFramework.Core.Support;
using AwesomeAssertions;
using NUnit.Framework;

namespace AutomationFramework.Tests.Contract;

/// <summary>
/// Contract verification against the schemas in <c>shared/contracts/</c>.
/// </summary>
/// <remarks>
/// These are the tests that catch drift. The schemas set <c>additionalProperties: false</c>, so a field the
/// service quietly adds, removes or renames fails here — which is the entire point. A failure in this class
/// is not necessarily a defect: it is a change nobody told the test suite about, and the correct response is
/// to find out which, then update the schema deliberately.
/// <para>
/// The same schemas are validated by the Java module with a different validator. Agreeing on the schema
/// rather than on a library is what makes the contract shared rather than duplicated.
/// </para>
/// </remarks>
[TestFixture]
[AllureNUnit]
[Category("Contract")]
public sealed class ToolshopContractTests : ApiTestBase
{
    [Test]
    [Description("The product list response matches its schema exactly.")]
    public async Task ProductListMatchesSchema()
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(1);
        result.Status.Should().Be(200);

        List<string> violations = SchemaValidator.Validate(
            "toolshop-paged-products.schema.json", result.RawBody);

        violations.Should().BeEmpty(
            "the product list no longer matches shared/contracts/toolshop-paged-products.schema.json. "
            + "Either the API changed or the schema is stale — decide which, then update the schema "
            + "deliberately rather than loosening it to make this pass");
    }

    [Test]
    [Description("A single product response matches its schema exactly.")]
    public async Task SingleProductMatchesSchema()
    {
        ApiResult<PagedProducts> listing = await Products.ListPageAsync(1);
        Product any = listing.Body!.Data[0];

        ApiResult<Product> result = await Products.GetByIdAsync(any.Id);
        result.Status.Should().Be(200);

        List<string> violations = SchemaValidator.Validate(
            "toolshop-product.schema.json", result.RawBody);

        violations.Should().BeEmpty(
            "the product representation drifted from shared/contracts/toolshop-product.schema.json");
    }

    [Test]
    [Description("Every product on a page matches the product schema, not just the first.")]
    public async Task EveryProductOnPageMatchesSchema()
    {
        ApiResult<PagedProducts> result = await Products.ListPageAsync(1);
        result.Status.Should().Be(200);

        // Checking only the first item is the usual shortcut, and it misses the case where one product has
        // a null field the others populate. A loop over the page costs nothing here.
        foreach (Product product in result.Body!.Data)
        {
            ApiResult<Product> single = await Products.GetByIdAsync(product.Id);

            List<string> violations = SchemaValidator.Validate(
                "toolshop-product.schema.json", single.RawBody);

            violations.Should().BeEmpty(
                $"product {product.Id} ('{product.Name}') does not match the product schema");
        }
    }

    [Test]
    [Description("The login response matches its schema exactly.")]
    public async Task LoginResponseMatchesSchema()
    {
        TestAccount account = await Accounts.CreateCustomerAsync();

        ApiResult<LoginResponse> result = await Auth.LoginAsync(account.Email, account.Password);
        result.Status.Should().Be(200);

        List<string> violations = SchemaValidator.Validate(
            "toolshop-login-response.schema.json", result.RawBody);

        violations.Should().BeEmpty(
            "the login response drifted from shared/contracts/toolshop-login-response.schema.json");
    }

    [Test]
    [Description("A 404 error body matches the error schema.")]
    public async Task NotFoundErrorMatchesSchema()
    {
        ApiResult<Product> result = await Products.GetByIdAsync(TestValues.WellFormedButMissingId());
        result.Status.Should().Be(404);

        List<string> violations = SchemaValidator.Validate(
            "toolshop-error.schema.json", result.RawBody);

        violations.Should().BeEmpty(
            "the 404 body does not match the error schema. The schema requires exactly one of 'message' "
            + "or 'error' — the demo API uses different fields on different endpoints, which is recorded "
            + "in shared/contracts/README.md");
    }

    [Test]
    [Description("A 401 error body matches the error schema.")]
    public async Task UnauthorizedErrorMatchesSchema()
    {
        ApiResult<NoBody> result = await Auth.CurrentUserAsync(null);
        result.Status.Should().Be(401);

        List<string> violations = SchemaValidator.Validate(
            "toolshop-error.schema.json", result.RawBody);

        violations.Should().BeEmpty("the 401 body does not match the error schema");
    }
}
