/**
 * Catalogue endpoints.
 *
 * One method per operation. No assertions, no status checks, no business logic —
 * those belong to the test. That is what keeps a client usable in a negative
 * test, where the expected thing is failure.
 *
 * The wrapper is injected through the constructor rather than read from a module
 * global, so the dependency stays visible and a test could point one client at a
 * different base address.
 *
 * Query values go through `params`, which Playwright encodes; path segments go
 * through `encodeURIComponent`. Nothing is concatenated raw into a URL. Every
 * path is **relative**: a leading slash would discard whatever path the base URL
 * carries, so `/products` against `https://host/api` would hit
 * `https://host/products`.
 *
 * `create`, `deleteIgnoringMissing` and `listByBrand` exist in the C# and Java
 * clients and are deliberately **not** ported, matching Python: no test in any
 * module calls any of them, and porting an unexercised request shape spreads dead
 * surface to a fourth module.
 */

import { pagedProductsSchema, type PagedProducts } from '@models/pagedProducts';
import { productSchema, type Product } from '@models/product';
import type { ApiHttp } from '@support/apiHttp';

import { resultOf, type ApiResult } from './apiResult';

const PRODUCTS = 'products';

export class ProductsClient {
  constructor(private readonly http: ApiHttp) {}

  /** `GET products?page=n` */
  async listPage(page: number): Promise<ApiResult<PagedProducts>> {
    const response = await this.http.get(PRODUCTS, { params: { page } });

    return resultOf(response, pagedProductsSchema);
  }

  /** `GET products/{id}` */
  async getById(productId: string): Promise<ApiResult<Product>> {
    const response = await this.http.get(`${PRODUCTS}/${encodeURIComponent(productId)}`);

    return resultOf(response, productSchema);
  }

  /** `GET products/search?q=...` */
  async search(query: string): Promise<ApiResult<PagedProducts>> {
    const response = await this.http.get(`${PRODUCTS}/search`, { params: { q: query } });

    return resultOf(response, pagedProductsSchema);
  }
}
