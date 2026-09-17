package com.company.automation.ui;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

import com.company.automation.UiTestBase;
import com.company.automation.clients.ApiResult;
import com.company.automation.models.PagedProducts;
import com.company.automation.models.Product;
import com.company.automation.pages.HomePage;
import com.company.automation.pages.ProductDetailPage;
import io.qameta.allure.Issue;
import io.qameta.allure.Step;
import java.util.List;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Browsing the catalogue in a real browser.
 *
 * <p>Only behaviour that genuinely needs a browser lives here. The search <i>rules</i> are covered
 * far more cheaply and thoroughly in {@code ProductCatalogueApiTest}; what this class checks is
 * that the page renders what the API returned, and that navigation works.
 *
 * <p>Note the import style: {@code assertThat} is statically imported from {@code
 * PlaywrightAssertions} because locator assertions auto-retry, which is what makes waits
 * unnecessary. Plain values use {@code Assertions.assertThat} qualified, so there is never
 * ambiguity about which library is being used on which kind of subject.
 */
@Tag("regression")
@DisplayName("Product browsing")
class ProductBrowsingTest extends UiTestBase {

  @Test
  @Tag("smoke")
  @Issue("TOOL-2")
  @DisplayName("shows only matching products when searching by name")
  void shouldShowOnlyMatchingProductsWhenSearchingByName() {
    String term = "Hammer";
    HomePage home = new HomePage(page()).open();

    home.search(term);

    // Two web-first assertions, in this order, and the second one matters.
    //
    // isVisible() alone passes immediately, because the pre-search grid is already on screen.
    // Reading
    // the names straight after it enumerates a grid that is still mid-re-render, which is a race
    // that
    // times out roughly one run in three.
    //
    // containsText retries until the first card is actually a search result, which is the
    // observable
    // signal that the re-render finished. No sleep, and nothing to tune.
    assertThat(home.productNames.first()).isVisible();
    assertThat(home.productNames.first()).containsText(term);

    List<String> shown = home.visibleProductNames();
    Assertions.assertThat(shown).as("the search returned something to check").isNotEmpty();

    for (String name : shown) {
      Assertions.assertThat(name)
          .as("the grid shows '%s', which does not match the search term '%s'", name, term)
          .containsIgnoringCase(term);
    }
  }

  @Test
  @Tag("smoke")
  @DisplayName("opens the detail page with the same name and price the card showed")
  void shouldOpenDetailPageMatchingTheCard() {
    Product expected = firstProductFromApi();

    HomePage home = new HomePage(page()).open();
    ProductDetailPage detail = home.openProduct(expected.id());

    // The card renders the price with a currency symbol, the detail page without one. Both were
    // read
    // from the live pages; asserting the detail page's format here is deliberate, not an oversight.
    assertThat(detail.productName).hasText(expected.name());
    assertThat(detail.unitPrice).hasText(expected.price().toPlainString());
  }

  @Test
  @DisplayName("renders a specifications table for a product")
  void shouldRenderSpecificationsForAProduct() {
    Product expected = firstProductFromApi();

    ProductDetailPage detail = new ProductDetailPage(page()).open(expected.id());

    assertThat(detail.specificationsTable).isVisible();
    Assertions.assertThat(detail.specificationNames())
        .as("a product detail page lists its specifications")
        .isNotEmpty();
  }

  @Test
  @DisplayName("moves to the second page of results without repeating products")
  void shouldMoveToSecondPageWithoutRepeatingProducts() {
    HomePage home = new HomePage(page()).open();
    assertThat(home.productNames.first()).isVisible();
    List<String> firstPageNames = home.visibleProductNames();

    home.goToNextPage();

    // Waiting on the observable change rather than on time: the first name differs once the new
    // page
    // has rendered. Playwright retries the assertion until it does or the timeout expires.
    assertThat(home.productNames.first()).not().hasText(firstPageNames.get(0));

    List<String> secondPageNames = home.visibleProductNames();
    Assertions.assertThat(secondPageNames)
        .as("the second page must not repeat products from the first")
        .doesNotContainAnyElementsOf(firstPageNames);
  }

  @Test
  @DisplayName("loads the catalogue without logging an unexpected browser console error")
  void shouldLoadCatalogueWithoutUnexpectedConsoleErrors() {
    HomePage home = new HomePage(page()).open();
    assertThat(home.productNames.first()).isVisible();

    // A page that renders correctly while throwing in the console is a real defect that functional
    // assertions never notice. Asserted as its own test so a console regression is not attributed
    // to an unrelated failure.
    //
    // Filtered through ConsoleErrorPolicy rather than asserted empty. The live application fires an
    // authenticated request on the anonymous catalogue page and logs the resulting 401 on every
    // load. That is its own behaviour, not something the suite caused. A blanket empty assertion
    // would be red on every run and would get deleted within a week, taking the useful part of the
    // check with it.
    Assertions.assertThat(significantConsoleErrors())
        .as(
            "the catalogue page logged a console error that is not on the reviewed allowlist in "
                + "ConsoleErrorPolicy. Either the page has a new defect, or the allowlist needs a "
                + "new entry with a documented reason.")
        .isEmpty();
  }

  /**
   * Fetches a product over the API to use as the expectation.
   *
   * <p>Preconditions and expected values come from the API, never from reading them off the page
   * first. A UI test that derives its expectation from the same page it is checking proves only
   * that the page agrees with itself.
   */
  @Step("Fetch a product from the API to use as the expected value")
  private Product firstProductFromApi() {
    ApiResult<PagedProducts> result = products.listPage(1);
    Assertions.assertThat(result.status())
        .as("the catalogue API must be reachable to set up this test")
        .isEqualTo(200);
    return result.body().data().get(0);
  }
}
