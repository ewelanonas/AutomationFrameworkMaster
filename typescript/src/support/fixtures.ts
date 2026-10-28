/**
 * The only `test` object any spec imports, and the one place `expect` is
 * re-exported from.
 *
 * A spec importing from `@playwright/test` directly is a defect, and
 * `no-restricted-imports` enforces it.
 *
 * **Two test objects, not one**, and the split is load-bearing rather than
 * cosmetic: an auto fixture that depends on `page` launches a browser for every
 * test that inherits it, and 39 of this module's 48 cases never open one. So
 * `uiTest` — with the `failureArtifacts` auto fixture — is a separate object built
 * on this one, and it lands with the reporting layer. Everything here is
 * browser-free unless a test asks for `page`.
 *
 * **Every fixture is test-scoped, including `appConfig`**, and that is a type
 * constraint rather than a preference. Playwright separates the two scopes in the
 * type system — `base.extend<TestFixtures, WorkerFixtures>` — so a fixture
 * declared `[fn, { scope: 'worker' }]` whose name lives in the *first* generic is
 * a TypeScript error. Worker scope would also buy nothing: `loadConfig()` is
 * already cached per process, so a worker-scoped version and a test-scoped version
 * do identical work after the first call.
 *
 * There are deliberately **no page-object fixtures**: a `homePage` fixture would
 * hide which screen a test starts on and couple the starting state to a fixture
 * body. Page objects are constructed in the test body from `page`, which is what
 * all three shipped modules do.
 *
 * There is deliberately **no shared-account and no configured-account fixture**.
 * You cannot misuse a fixture that does not exist.
 *
 * `noInternalDetailLeaked` is deliberately **not** here: it asserts, and nothing
 * under `src/` asserts. It lives in `tests/api/fixtures.ts`.
 */

import { expect, test as base } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';

import { AuthClient } from '@clients/authClient';
import { ProductsClient } from '@clients/productsClient';
import { UsersClient } from '@clients/usersClient';
import { AccountFlow } from '@flows/accountFlow';
import { AuthFlow } from '@flows/authFlow';
import type { TestAccount } from '@models/testAccount';

import { ApiHttp } from './apiHttp';
import { loadConfig, type AppConfig } from './config';
import { playwrightTimeouts } from './timeouts';

export type BaseFixtures = {
  appConfig: AppConfig;
  apiHttp: ApiHttp;
  productsClient: ProductsClient;
  authClient: AuthClient;
  usersClient: UsersClient;
  accountFlow: AccountFlow;
  authFlow: AuthFlow;
  disposableAccount: TestAccount;
  consoleErrors: string[];
};

export const test = base.extend<BaseFixtures>({
  appConfig: async ({}, use) => {
    await use(loadConfig());
  },

  // NOT the built-in `request` fixture. That one inherits `use.baseURL`, which
  // playwright.config.ts sets to config.ui.baseUrl — so a client built over it would
  // resolve every API call against the UI host and fail with HTML bodies and
  // misleading 404s instead of with a configuration error.
  apiHttp: async ({ playwright, appConfig }, use) => {
    const context = await playwright.request.newContext({
      // Trailing slash deliberate, mirroring api_http.py line 46
      // (`base_url=config.api.base_url + "/"`). APIRequestContext resolves a relative
      // path with `new URL(path, baseURL)` semantics, where a base URL with no
      // trailing slash loses its last segment: 'products' against
      // 'https://host/api' resolves to 'https://host/products'. The config layer
      // strips exactly one trailing slash, so appending exactly one here is
      // deterministic rather than a guess about what the descriptor carried.
      baseURL: `${appConfig.api.baseUrl}/`,
      // Read off the policy object, not off appConfig.timeouts, so every waiting
      // mechanism in the module gets its number from the one mapping function.
      timeout: playwrightTimeouts(appConfig).apiMs,
      // The correlation id is deliberately NOT here: it is minted per request inside
      // ApiHttp because the format carries a sequence number, and a context-level
      // header would make every request in a test share one id.
      extraHTTPHeaders: { Accept: 'application/json' },
    });

    await use(new ApiHttp(context));

    await context.dispose();
  },

  productsClient: async ({ apiHttp }, use) => {
    await use(new ProductsClient(apiHttp));
  },

  authClient: async ({ apiHttp }, use) => {
    await use(new AuthClient(apiHttp));
  },

  usersClient: async ({ apiHttp }, use) => {
    await use(new UsersClient(apiHttp));
  },

  accountFlow: async ({ usersClient, authClient }, use) => {
    await use(new AccountFlow(usersClient, authClient));
  },

  authFlow: async ({ authClient }, use) => {
    await use(new AuthFlow(authClient));
  },

  // A fresh account this test owns outright. No teardown, and that is a property of
  // the target rather than an omission: the demo API offers no self-delete. Every
  // address carries the `af-` prefix and the run id so a janitor can find them.
  disposableAccount: async ({ accountFlow }, use) => {
    const account = await accountFlow.createCustomer();

    await use(account);
  },

  consoleErrors: async ({}, use) => {
    const collected: string[] = [];

    await use(collected);
  },

  // An override of the built-in `page` fixture, which is the documented Playwright
  // pattern for depending on the original. It lives on the BASE object rather than
  // on `uiTest`, and that is safe because an override is lazy: it runs only for a
  // test that actually requests `page`, so the 39 non-browser cases are unaffected.
  // The contrast with `failureArtifacts` is the point — an AUTO fixture depending on
  // `page` would launch a browser for every inheriting test.
  page: async ({ page, consoleErrors }, use) => {
    page.on('console', (message) => {
      recordConsoleMessage(consoleErrors, message);
    });
    page.on('pageerror', (error) => {
      recordPageError(consoleErrors, error);
    });

    await use(page);
  },
});

export { expect };

/**
 * Records one console message, **filtering on severity**.
 *
 * The `type()` guard is what makes the console allowlist mean what it says.
 * Without it, `log`, `info`, `warning` and `debug` output lands in `consoleErrors`
 * too and the console test fails on benign application chatter — which pushes the
 * next person to add allowlist entries for noise instead of fixing the filter.
 * `python/tests/ui/conftest.py`'s `record_console_message` is
 * `if message.type == "error"` and nothing else.
 *
 * A named module-level function, passed this test's own array explicitly. Reaching
 * for the array through a module-level global instead would trade a readability nit
 * for shared mutable state and unbind the handler from the test that registered it.
 */
function recordConsoleMessage(consoleErrors: string[], message: ConsoleMessage): void {
  if (message.type() !== 'error') {
    return;
  }

  consoleErrors.push(message.text());
}

/**
 * Records one uncaught page error.
 *
 * Takes `Error` and pushes `error.message` for a reason worth keeping in view:
 * Playwright emits an `Error` object to `pageerror`, not a string. Binding
 * `array.push` to the event would, at runtime, put an `Error` into a `string[]`,
 * after which the console allowlist throws while lowercasing it and the console
 * test fails for a reason unrelated to the console.
 */
function recordPageError(consoleErrors: string[], error: Error): void {
  consoleErrors.push(error.message);
}
