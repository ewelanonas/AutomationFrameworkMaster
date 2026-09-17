package com.company.automation.clients;

import static io.restassured.RestAssured.given;

import com.company.automation.models.PagedProducts;
import com.company.automation.models.Product;
import com.company.automation.support.ApiSpec;
import io.restassured.response.Response;

/**
 * Catalogue endpoints.
 *
 * <p>One method per operation. No assertions, no status checks, no business logic — those belong to
 * the test. Path and query values go through REST Assured's parameter handling so they are encoded
 * properly rather than concatenated into a URL.
 */
public final class ProductsClient {

  private static final String PRODUCTS = "/products";

  /** {@code GET /products?page=n} */
  public ApiResult<PagedProducts> listPage(int page) {
    Response response =
        given().spec(ApiSpec.spec()).queryParam("page", page).when().get(PRODUCTS).thenReturn();
    return ApiResult.of(response, PagedProducts.class);
  }

  /** {@code GET /products/{id}} */
  public ApiResult<Product> getById(String productId) {
    Response response =
        given()
            .spec(ApiSpec.spec())
            .pathParam("id", productId)
            .when()
            .get(PRODUCTS + "/{id}")
            .thenReturn();
    return ApiResult.of(response, Product.class);
  }

  /** {@code GET /products/search?q=...} */
  public ApiResult<PagedProducts> search(String query) {
    Response response =
        given()
            .spec(ApiSpec.spec())
            .queryParam("q", query)
            .when()
            .get(PRODUCTS + "/search")
            .thenReturn();
    return ApiResult.of(response, PagedProducts.class);
  }

  /** {@code GET /products?by_brand=<brandId>} */
  public ApiResult<PagedProducts> listByBrand(String brandId) {
    Response response =
        given()
            .spec(ApiSpec.spec())
            .queryParam("by_brand", brandId)
            .when()
            .get(PRODUCTS)
            .thenReturn();
    return ApiResult.of(response, PagedProducts.class);
  }

  /**
   * {@code POST /products} — creation requires an admin token.
   *
   * <p>Present so the authorization boundary can be tested: the same call with no token, with a
   * customer token, and with an admin token must behave differently.
   */
  public ApiResult<Product> create(String bearerHeaderValue, String jsonBody) {
    Response response =
        given()
            .spec(ApiSpec.spec())
            .header("Authorization", bearerHeaderValue)
            .body(jsonBody)
            .when()
            .post(PRODUCTS)
            .thenReturn();
    return ApiResult.of(response, Product.class);
  }

  /** {@code DELETE /products/{id}} — tolerates an already-deleted record, for use in cleanup. */
  public ApiResult<Void> deleteIgnoringMissing(String bearerHeaderValue, String productId) {
    Response response =
        given()
            .spec(ApiSpec.spec())
            .header("Authorization", bearerHeaderValue)
            .pathParam("id", productId)
            .when()
            .delete(PRODUCTS + "/{id}")
            .thenReturn();
    return ApiResult.ofStatusOnly(response);
  }
}
