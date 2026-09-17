package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import java.util.ArrayList;
import java.util.List;

/**
 * A single product's detail page.
 *
 * <p>Worth noting for anyone writing assertions: the price here renders <b>without</b> a currency
 * symbol ({@code 14.15}), while the catalogue card renders <b>with</b> one ({@code $14.15}). Two
 * different elements, two different formats. Both were read from the live pages.
 */
public final class ProductDetailPage {

  private static final String PATH_PREFIX = "/product/";

  private final Page page;

  public final Locator productName;
  public final Locator unitPrice;
  public final Locator description;
  public final Locator co2RatingBadge;
  public final Locator quantityInput;
  public final Locator increaseQuantity;
  public final Locator decreaseQuantity;
  public final Locator addToCartButton;
  public final Locator addToFavoritesButton;
  public final Locator specificationsTable;

  public ProductDetailPage(Page page) {
    this.page = page;
    this.productName = page.getByTestId("product-name");
    this.unitPrice = page.getByTestId("unit-price");
    this.description = page.getByTestId("product-description");
    this.co2RatingBadge = page.getByTestId("co2-rating-badge");
    this.quantityInput = page.getByTestId("quantity");
    this.increaseQuantity = page.getByTestId("increase-quantity");
    this.decreaseQuantity = page.getByTestId("decrease-quantity");
    this.addToCartButton = page.getByTestId("add-to-cart");
    this.addToFavoritesButton = page.getByTestId("add-to-favorites");
    this.specificationsTable = page.getByTestId("product-specs");
  }

  /** Opens a product directly by id, skipping the catalogue. */
  public ProductDetailPage open(String productId) {
    page.navigate(PATH_PREFIX + productId);
    return this;
  }

  public ProductDetailPage setQuantity(int quantity) {
    quantityInput.fill(String.valueOf(quantity));
    return this;
  }

  public ProductDetailPage increaseQuantityBy(int times) {
    for (int i = 0; i < times; i++) {
      increaseQuantity.click();
    }
    return this;
  }

  public ProductDetailPage addToCart() {
    addToCartButton.click();
    return this;
  }

  /** The specification value cell for a named row, for example {@code Weight}. */
  public Locator specificationValue(String specificationName) {
    return specificationsTable
        .locator("[data-test='spec-row']")
        .filter(new Locator.FilterOptions().setHasText(specificationName))
        .locator("[data-test='spec-value']");
  }

  /**
   * All specification row names, in display order.
   *
   * <p>Resolved in one call via {@code allInnerTexts()} rather than {@code count()} plus {@code
   * nth(i)}, for the same reason as {@code HomePage.visibleProductNames()}: indexing after a
   * separate count is a race whenever the table can re-render.
   */
  public List<String> specificationNames() {
    List<String> names = new ArrayList<>();
    Locator cells = specificationsTable.locator("[data-test='spec-name']");
    for (String text : cells.allInnerTexts()) {
      names.add(text.trim());
    }
    return names;
  }
}
