---
inclusion: fileMatch
fileMatchPattern: ["typescript/**", "**/*.ts", "**/*.spec.ts", "**/playwright.config.ts", "**/package.json", "**/tsconfig.json", "**/eslint.config.js"]
---

# TypeScript Automation Conventions

Stack: Node 22, pnpm, Playwright Test, Zod, `@faker-js/faker`,
allure-playwright, ESLint + Prettier, strict TypeScript.

## Project layout

```text
typescript/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── playwright.config.ts
├── src/
│   ├── support/    config.ts, fixtures.ts, waits.ts, redaction.ts, runContext.ts
│   ├── models/     Zod schemas + inferred types
│   ├── pages/      page + component objects
│   ├── clients/    APIRequestContext-based typed clients
│   └── flows/      business actions
└── tests/
    ├── ui/  api/  contract/
```

## tsconfig essentials

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  }
}
```

`tsc --noEmit` is a required CI gate. Playwright transpiles without type
checking, so without this gate type errors ship.

## playwright.config.ts rules

```ts
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? '50%' : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['allure-playwright', { resultsDir: 'reports/allure-results' }],
  ],
  use: {
    baseURL: config.ui.baseUrl,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    { name: 'chromium', dependencies: ['setup'], use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- `fullyParallel: true` always. `retries` never above 1.
- `forbidOnly` in CI so a stray `test.only` fails the build.
- Never set a global `test.describe.serial` to work around shared state.
- Auth once in a `setup` project, save `storageState`, reuse it in test
  projects. Do not log in through the UI per test.

## Test structure

- Files `<feature>.spec.ts`. `test.describe('<Feature>')`.
- Titles read as sentences: `test('rejects payment when the card has expired')`.
- Tag with the built-in `tag` option, not string suffixes:
  `test('...', { tag: ['@smoke', '@checkout'] }, async ({ page }) => {})`.
  Select with `--grep @smoke`.
- Use `test.step` to name logical phases — it makes traces and Allure readable.
- `test.fixme`/`test.skip` require a reason with a ticket id.
- Annotate the requirement: `test.info().annotations.push({ type: 'issue', description: 'ORD-142' })`.

```ts
test(
  'rejects payment when the card has expired',
  { tag: ['@regression', '@checkout'] },
  async ({ checkoutFlow, checkoutPage }) => {
    const customer = customerBuilder().withExpiredCard().build();

    await test.step('start checkout', () => checkoutFlow.start(customer));

    await expect(checkoutPage.paymentError).toHaveText('Your card has expired.');
  },
);
```

## Fixtures, not beforeEach

Compose behaviour with `test.extend`. Custom fixtures in
`src/support/fixtures.ts` provide page objects, clients, builders, and created
data with automatic teardown.

```ts
export const test = base.extend<{ checkoutPage: CheckoutPage; ordersClient: OrdersClient }>({
  checkoutPage: async ({ page }, use) => { await use(new CheckoutPage(page)); },
  ordersClient: async ({ request }, use) => { await use(new OrdersClient(request)); },
});
```

- Import `test` and `expect` from `src/support/fixtures.ts` in every spec,
  never from `@playwright/test` directly.
- Data-creating fixtures delete after `use()` returns, tolerating 404.
- Use `beforeEach` only for navigation. Everything else is a fixture.

## Page objects

- Expose `Locator` properties (readonly, built in the constructor), not
  selector strings and not `getX()` methods that re-query.
- Methods are actions returning `Promise<void>` or a value. No `expect` inside.
- Use `page.getByTestId`, `getByRole`, `getByLabel`. Scope with `locator.filter`
  and `locator.nth` only when the list is semantically ordered.
- No `page.waitForTimeout`. Rely on auto-waiting; when you truly need a
  condition, use `expect.poll` or `page.waitForResponse` with a predicate.

## API clients

- Use Playwright's `APIRequestContext` so API and UI share cookies/tracing.
- Validate every response body with a Zod schema and return the inferred type.
  `schema.parse(await res.json())` — parse failures are real defects.
- Return `{ status, body }` rather than throwing on non-2xx.
- Set `extraHTTPHeaders` with the correlation id in the request fixture.

## Assertions

- `expect` from Playwright for everything. Web-first assertions
  (`toHaveText`, `toBeVisible`, `toHaveURL`) auto-retry — prefer them over
  `expect(await locator.textContent())`.
- `expect.soft` to verify several fields of one result.
- `expect.poll` for eventual consistency on API state, with a timeout.
- Add a message: `expect(x, 'business rule').toBe(y)`.
- Visual comparison (`toHaveScreenshot`) only alongside a functional
  assertion, with `maxDiffPixelRatio` set and platform-specific snapshots.

## Lint rules that matter

Enable and treat as errors: `@typescript-eslint/no-floating-promises`,
`no-misused-promises`, `require-await`, `await-thenable`, plus
`eslint-plugin-playwright` with `no-wait-for-timeout`, `no-skipped-test`,
`no-conditional-in-test`, `expect-expect`, `no-force-option`,
`missing-playwright-await`.

A missing `await` on a Playwright call is the single most common source of
flake in this stack. The lint rule is not optional.

## Readability: keep array chains short

`filter().map().reduce()` is the TypeScript equivalent of a LINQ chain. One
call is clear, three stacked is not — especially with `async` in the mix.

```ts
// Avoid
const names = rows
  .filter((r) => r.isActive)
  .sort((a, b) => a.createdAt - b.createdAt)
  .map((r) => r.name.trim());

// Prefer
const names: string[] = [];
for (const row of rows) {
  if (!row.isActive) continue;
  names.push(row.name.trim());
}
names.sort();
```

Rules:

- One array method on one line is fine: `orders.filter((o) => o.isPaid)`.
- No chains of three or more, and no chain that wraps across lines, in
  `tests/`, `pages/`, or `flows/`. Use a `for...of` loop.
- No `reduce`, ever, in test code. It is the least readable construct in the
  language and a loop is always clearer.
- Never `await` inside `map` and then `Promise.all` a chained pipeline. Write a
  `for...of` loop with `await` inside, or one explicit `Promise.all` over a
  named array. Sequential awaits in a loop are usually what a test wants
  anyway.
- No nested ternaries. No ternaries inside template literals.
- No optional-chaining trains (`a?.b?.c?.d`). Add a guard that fails with a
  clear message instead — a silent `undefined` becomes a confusing assertion
  failure three lines later.

Other TypeScript constructs to avoid in test code:

| Avoid                                        | Prefer                              |
| -------------------------------------------- | ----------------------------------- |
| Conditional types, mapped types, `infer` in test code | A plain interface or Zod-inferred type |
| Generic helpers with more than one type parameter | A concrete typed helper        |
| Decorators                                    | Fixtures                            |
| Barrel files re-exporting everything          | Direct imports from the module      |
| Destructuring with renames and defaults nested two levels deep | Plain property access |
| IIFEs, currying, point-free style              | Named functions                     |
| `as const` gymnastics to derive types from data | An explicit type                  |

Type-level cleverness belongs in `src/support/` at most, and only where it
buys real safety. A test file should contain no types beyond annotations.

## Anti-patterns specific to TypeScript

- Missing `await` on a locator action or assertion.
- `page.waitForTimeout` / `setTimeout` as a wait.
- `any`, `as unknown as`, or non-null `!` to silence the compiler.
- `try/catch` around a step to keep a test green.
- `if (await locator.isVisible())` branching in a test.
- Selector strings in spec files.
- Importing `test` from `@playwright/test` in specs, bypassing fixtures.
- `test.describe.serial` used to share state between tests.
- `process.env.X` read inline in a test instead of typed config.
