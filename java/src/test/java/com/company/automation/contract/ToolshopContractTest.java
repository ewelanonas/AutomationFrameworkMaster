package com.company.automation.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.company.automation.ApiTestBase;
import com.company.automation.clients.ApiResult;
import com.company.automation.models.PagedProducts;
import com.company.automation.models.Product;
import com.company.automation.support.SchemaValidator;
import com.company.automation.support.TestValues;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Contract verification against the schemas in {@code shared/contracts/}.
 *
 * <p>These are the tests that catch drift. The schemas set {@code additionalProperties: false}, so
 * a field the service quietly adds, removes or renames fails here — which is the entire point. A
 * failure in this class is not necessarily a defect: it is a change that nobody told the test suite
 * about, and the correct response is to find out which, then update the schema deliberately.
 *
 * <p>Tagged {@code contract} so CI can run them on their own, as a fast gate that needs no browser.
 */
@Tag("contract")
@DisplayName("Toolshop API contract")
class ToolshopContractTest extends ApiTestBase {

  @Test
  @DisplayName("the product list response matches its schema exactly")
  void productListMatchesSchema() {
    ApiResult<PagedProducts> result = products.listPage(1);
    assertThat(result.status()).isEqualTo(200);

    List<String> violations =
        SchemaValidator.validate("toolshop-paged-products.schema.json", result.rawBody());

    assertThat(violations)
        .as(
            "the product list no longer matches shared/contracts/toolshop-paged-products.schema.json. "
                + "Either the API changed or the schema is stale — decide which, then update the schema "
                + "deliberately rather than loosening it to make this pass.")
        .isEmpty();
  }

  @Test
  @DisplayName("a single product response matches its schema exactly")
  void singleProductMatchesSchema() {
    Product any = products.listPage(1).body().data().get(0);

    ApiResult<Product> result = products.getById(any.id());
    assertThat(result.status()).isEqualTo(200);

    List<String> violations =
        SchemaValidator.validate("toolshop-product.schema.json", result.rawBody());

    assertThat(violations)
        .as("the product representation drifted from shared/contracts/toolshop-product.schema.json")
        .isEmpty();
  }

  @Test
  @DisplayName("every product on a page matches the product schema, not just the first")
  void everyProductOnPageMatchesSchema() {
    ApiResult<PagedProducts> result = products.listPage(1);
    assertThat(result.status()).isEqualTo(200);

    // Checking only the first item is the usual shortcut, and it misses the case where one product
    // has a null field the others populate. A loop over the page costs nothing here.
    for (Product product : result.body().data()) {
      ApiResult<Product> single = products.getById(product.id());

      List<String> violations =
          SchemaValidator.validate("toolshop-product.schema.json", single.rawBody());

      assertThat(violations)
          .as("product %s ('%s') does not match the product schema", product.id(), product.name())
          .isEmpty();
    }
  }

  @Test
  @DisplayName("the login response matches its schema exactly")
  void loginResponseMatchesSchema() {
    com.company.automation.models.TestAccount account = accounts.createCustomer();

    ApiResult<com.company.automation.models.LoginResponse> result =
        auth.login(account.email(), account.password());
    assertThat(result.status()).isEqualTo(200);

    List<String> violations =
        SchemaValidator.validate("toolshop-login-response.schema.json", result.rawBody());

    assertThat(violations)
        .as("the login response drifted from shared/contracts/toolshop-login-response.schema.json")
        .isEmpty();
  }

  @Test
  @DisplayName("a 404 error body matches the error schema")
  void notFoundErrorMatchesSchema() {
    ApiResult<Product> result = products.getById(TestValues.wellFormedButMissingId());
    assertThat(result.status()).isEqualTo(404);

    List<String> violations =
        SchemaValidator.validate("toolshop-error.schema.json", result.rawBody());

    assertThat(violations)
        .as(
            "the 404 body does not match the error schema. The schema requires exactly one of "
                + "'message' or 'error' — the demo API uses different fields on different endpoints, "
                + "which is recorded in shared/contracts/README.md.")
        .isEmpty();
  }

  @Test
  @DisplayName("a 401 error body matches the error schema")
  void unauthorizedErrorMatchesSchema() {
    ApiResult<Void> result = auth.currentUser(null);
    assertThat(result.status()).isEqualTo(401);

    List<String> violations =
        SchemaValidator.validate("toolshop-error.schema.json", result.rawBody());

    assertThat(violations).as("the 401 body does not match the error schema").isEmpty();
  }
}
