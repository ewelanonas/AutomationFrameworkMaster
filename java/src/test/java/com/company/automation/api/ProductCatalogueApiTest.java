package com.company.automation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.SoftAssertions.assertSoftly;

import com.company.automation.ApiTestBase;
import com.company.automation.clients.ApiResult;
import com.company.automation.models.ApiError;
import com.company.automation.models.PagedProducts;
import com.company.automation.models.Product;
import com.company.automation.support.TestValues;
import io.qameta.allure.Issue;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Catalogue read behaviour.
 *
 * <p>Note what these tests do <b>not</b> assert: that the catalogue holds exactly 50 products. That
 * number is true today and is not part of any contract, so asserting it would produce a red suite
 * the day someone adds a product. The assertions target invariants instead — page size is
 * respected, {@code from}/{@code to} agree with the page contents, {@code last_page} follows from
 * {@code total}, and no product appears on two pages. Those hold regardless of how much data
 * exists.
 */
@Tag("regression")
@DisplayName("Product catalogue API")
class ProductCatalogueApiTest extends ApiTestBase {

  @Test
  @Tag("smoke")
  @Issue("TOOL-1")
  @DisplayName("returns the first page of products with a consistent pagination envelope")
  void shouldReturnFirstPageWithConsistentEnvelope() {
    ApiResult<PagedProducts> result = products.listPage(1);

    assertThat(result.status()).as("listing the catalogue must succeed").isEqualTo(200);

    PagedProducts page = result.body();
    assertSoftly(
        softly -> {
          softly.assertThat(page.currentPage()).as("echoes the requested page").isEqualTo(1);
          softly.assertThat(page.perPage()).as("page size is advertised").isGreaterThan(0);
          softly
              .assertThat(page.size())
              .as("a page never carries more items than the advertised page size")
              .isLessThanOrEqualTo(page.perPage());
          softly.assertThat(page.total()).as("total item count is advertised").isPositive();
          softly.assertThat(page.from()).as("first page starts at item 1").isEqualTo(1);
          softly
              .assertThat(page.to())
              .as("'to' agrees with the number of items actually returned")
              .isEqualTo(page.size());
          softly
              .assertThat(page.lastPage())
              .as("last_page follows from total and per_page")
              .isEqualTo(expectedLastPage(page.total(), page.perPage()));
        });
  }

  @Test
  @Tag("smoke")
  @DisplayName("returns fully populated products, not empty shells")
  void shouldReturnPopulatedProducts() {
    ApiResult<PagedProducts> result = products.listPage(1);
    assertThat(result.status()).isEqualTo(200);

    Product first = result.body().data().get(0);

    assertSoftly(
        softly -> {
          softly.assertThat(first.id()).as("id is present").isNotBlank();
          softly.assertThat(first.name()).as("name is present").isNotBlank();
          softly
              .assertThat(first.price())
              .as("price is a positive amount")
              .isGreaterThan(BigDecimal.ZERO);
          softly.assertThat(first.inStock()).as("stock flag is present").isNotNull();
          softly
              .assertThat(first.category())
              .as("category is expanded, not just an id")
              .isNotNull();
          softly.assertThat(first.brand()).as("brand is expanded, not just an id").isNotNull();
          softly.assertThat(first.category().name()).as("category name is present").isNotBlank();
          softly.assertThat(first.brand().name()).as("brand name is present").isNotBlank();
        });
  }

  @Test
  @DisplayName("returns the requested product when the id exists")
  void shouldReturnRequestedProductWhenIdExists() {
    Product fromList = products.listPage(1).body().data().get(0);

    ApiResult<Product> result = products.getById(fromList.id());

    assertThat(result.status()).isEqualTo(200);
    assertThat(result.body())
        .as("fetching a product by id returns the same product the listing showed")
        .usingRecursiveComparison()
        .isEqualTo(fromList);
  }

  @Test
  @DisplayName("returns 404 with a safe message when the product id does not exist")
  void shouldReturn404WhenProductIdDoesNotExist() {
    ApiResult<Product> result = products.getById(TestValues.wellFormedButMissingId());

    assertThat(result.status())
        .as("a well-formed id that matches nothing is a 404, not a 400 or a 500")
        .isEqualTo(404);

    ApiError error = result.error();
    assertThat(error.text()).as("the error explains what went wrong").isNotBlank();
    assertThatErrorLeaksNoInternals(result.rawBody());
  }

  @Test
  @DisplayName("never returns the same product on two different pages")
  void shouldNotRepeatProductsAcrossPages() {
    PagedProducts firstPage = products.listPage(1).body();
    int pagesToCheck = Math.min(firstPage.lastPage(), 4);

    List<String> seenIds = new ArrayList<>();
    for (int pageNumber = 1; pageNumber <= pagesToCheck; pageNumber++) {
      ApiResult<PagedProducts> result = products.listPage(pageNumber);
      assertThat(result.status()).as("page %d must load", pageNumber).isEqualTo(200);

      List<String> idsOnPage = result.body().ids();
      for (String id : idsOnPage) {
        assertThat(seenIds)
            .as(
                "product %s appeared on more than one page, so pagination is losing or duplicating rows",
                id)
            .doesNotContain(id);
        seenIds.add(id);
      }
    }

    assertThat(seenIds).as("the pages checked returned some products").isNotEmpty();
  }

  @Test
  @DisplayName("returns an empty page rather than an error beyond the last page")
  void shouldReturnEmptyPageBeyondLastPage() {
    ApiResult<PagedProducts> result = products.listPage(9999);

    assertSoftly(
        softly -> {
          softly
              .assertThat(result.status())
              .as("a page beyond the end is an empty result, not an error")
              .isEqualTo(200);
          softly.assertThat(result.body().isEmpty()).as("no items are returned").isTrue();
          softly.assertThat(result.body().from()).as("'from' is null on an empty page").isNull();
          softly.assertThat(result.body().to()).as("'to' is null on an empty page").isNull();
        });
  }

  @ParameterizedTest(name = "page {0} reports itself as page {0}")
  @ValueSource(ints = {1, 2, 3})
  @DisplayName("echoes the requested page number")
  void shouldEchoRequestedPageNumber(int requestedPage) {
    ApiResult<PagedProducts> result = products.listPage(requestedPage);

    assertThat(result.status()).isEqualTo(200);
    assertThat(result.body().currentPage()).isEqualTo(requestedPage);
  }

  @Test
  @DisplayName("returns only products whose name matches the search term")
  void shouldReturnOnlyMatchingProductsWhenSearching() {
    String term = "Hammer";

    ApiResult<PagedProducts> result = products.search(term);

    assertThat(result.status()).isEqualTo(200);
    assertThat(result.body().isEmpty()).as("the demo catalogue contains hammers").isFalse();

    // A loop rather than a stream chain: every reader can follow it, and the failure message names
    // the offending product instead of reporting that some predicate was false.
    for (Product product : result.body().data()) {
      assertThat(product.name())
          .as("search returned '%s', which does not match the term '%s'", product.name(), term)
          .containsIgnoringCase(term);
    }
  }

  @Test
  @DisplayName("returns an empty result for a search term that matches nothing")
  void shouldReturnEmptyResultWhenSearchMatchesNothing() {
    String term = TestValues.uniqueName("no-such-product");

    ApiResult<PagedProducts> result = products.search(term);

    assertSoftly(
        softly -> {
          softly
              .assertThat(result.status())
              .as("no matches is an empty success, not a 404")
              .isEqualTo(200);
          softly.assertThat(result.body().isEmpty()).as("nothing matched").isTrue();
          softly.assertThat(result.body().total()).as("total reflects the empty result").isZero();
        });
  }

  private static int expectedLastPage(int total, int perPage) {
    if (total == 0) {
      return 1;
    }
    int fullPages = total / perPage;
    if (total % perPage == 0) {
      return fullPages;
    }
    return fullPages + 1;
  }

  /**
   * An error body must not hand an attacker a map of the implementation.
   *
   * <p>Kept next to the tests that need it rather than in a shared base class, so the rule it
   * enforces is visible at the point of use.
   */
  static void assertThatErrorLeaksNoInternals(String rawBody) {
    String lower = rawBody.toLowerCase(java.util.Locale.ROOT);
    List<String> forbidden =
        List.of(
            "exception",
            "stack trace",
            "at com.",
            "at java.",
            "sqlstate",
            "select * from",
            "/var/www",
            "c:\\\\");

    for (String marker : forbidden) {
      assertThat(lower)
          .as("the error body leaks an internal detail ('%s'), which helps an attacker", marker)
          .doesNotContain(marker);
    }
  }
}
