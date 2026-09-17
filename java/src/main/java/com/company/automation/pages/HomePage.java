package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import java.util.ArrayList;
import java.util.List;

/**
 * The catalogue landing page: search, sort, filters, product grid, pagination.
 *
 * <p>Locators are built once in the constructor and exposed as fields. No assertions live here, so
 * this page object is equally usable by a test expecting results and one expecting none.
 *
 * <p>Every locator uses {@code getByTestId}, which resolves against the {@code data-test} attribute
 * configured in {@code shared/environments/local.json}. They were read from the live page's
 * accessibility tree and DOM, not guessed.
 */
public final class HomePage {

  private final Page page;

  public final Locator searchInput;
  public final Locator searchSubmit;
  public final Locator searchReset;
  public final Locator sortSelect;
  public final Locator productNames;
  public final Locator productPrices;
  public final Locator paginationNext;
  public final Locator paginationPrevious;
  public final Locator signInLink;
  public final Locator ecoFriendlyFilter;

  public HomePage(Page page) {
    this.page = page;
    this.searchInput = page.getByTestId("search-query");
    this.searchSubmit = page.getByTestId("search-submit");
    this.searchReset = page.getByTestId("search-reset");
    this.sortSelect = page.getByTestId("sort");
    this.productNames = page.getByTestId("product-name");
    this.productPrices = page.getByTestId("product-price");
    this.paginationNext = page.getByTestId("pagination-next");
    this.paginationPrevious = page.getByTestId("pagination-prev");
    this.signInLink = page.getByTestId("nav-sign-in");
    this.ecoFriendlyFilter = page.getByTestId("eco-friendly-filter");
  }

  /** Opens the catalogue. The base URL comes from config, so no absolute URL appears here. */
  public HomePage open() {
    page.navigate("/");
    return this;
  }

  /** Runs a search and returns this page, since results render in place. */
  public HomePage search(String query) {
    searchInput.fill(query);
    searchSubmit.click();
    return this;
  }

  /** Clears the current search. */
  public HomePage resetSearch() {
    searchReset.click();
    return this;
  }

  /** A single product card, addressed by product id. */
  public Locator productCard(String productId) {
    return page.getByTestId("product-" + productId);
  }

  /**
   * The card whose visible name matches exactly.
   *
   * <p>Filtered by content rather than by position. An index would break the moment the sort order
   * or the catalogue changes, which it does.
   */
  public Locator productCardByName(String productName) {
    return page.locator("[data-test^='product-']")
        .filter(
            new Locator.FilterOptions()
                .setHas(page.getByText(productName, new Page.GetByTextOptions().setExact(true))));
  }

  /** Opens a product's detail page by clicking its card. */
  public ProductDetailPage openProduct(String productId) {
    productCard(productId).click();
    return new ProductDetailPage(page);
  }

  /** Goes to the sign-in page. */
  public LoginPage openSignIn() {
    signInLink.click();
    return new LoginPage(page);
  }

  /** Moves to the next page of results. */
  public HomePage goToNextPage() {
    paginationNext.click();
    return this;
  }

  /** Selects a sort option by its visible label, for example {@code Name (A - Z)}. */
  public HomePage sortBy(String visibleLabel) {
    sortSelect.selectOption(
        new com.microsoft.playwright.options.SelectOption().setLabel(visibleLabel));
    return this;
  }

  /**
   * Visible product names in display order.
   *
   * <p>Uses {@code allInnerTexts()}, which resolves the whole set in one call, rather than reading
   * {@code count()} and then indexing with {@code nth(i)}.
   *
   * <p>That difference is not stylistic. The count-then-index version has a race: the count is
   * taken against the grid as it is now, and if the grid re-renders mid-loop — which it does after
   * a search or a page change — {@code nth(i)} waits for an element that no longer exists and the
   * test times out on index 6 of a list that is now 6 long. This was a real failure in this suite
   * before the change, not a hypothetical.
   */
  public List<String> visibleProductNames() {
    List<String> names = new ArrayList<>();
    for (String text : productNames.allInnerTexts()) {
      names.add(text.trim());
    }
    return names;
  }

  /** Number of product cards currently rendered. */
  public int visibleProductCount() {
    return productNames.count();
  }

  /** The out-of-stock badge inside a given card. Absent when the product is in stock. */
  public Locator outOfStockBadgeIn(String productId) {
    return productCard(productId).getByTestId("out-of-stock");
  }
}
