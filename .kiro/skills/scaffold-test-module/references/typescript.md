# TypeScript Module Setup

## Create the module

```powershell
New-Item -ItemType Directory -Path typescript -Force
pnpm --dir typescript init
pnpm --dir typescript add -D @playwright/test typescript @types/node zod @faker-js/faker allure-playwright eslint @eslint/js typescript-eslint eslint-plugin-playwright prettier @axe-core/playwright
pnpm --dir typescript exec playwright install --with-deps
```

Do not run `pnpm create playwright` and keep its generated example specs. They
put selectors in tests and demonstrate patterns this repo bans.

## package.json scripts

```json
{
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:smoke": "playwright test --grep @smoke --grep-invert @quarantine",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . && prettier --check .",
    "lint:fix": "eslint . --fix && prettier --write ."
  }
}
```

Never add a `--ui`, `--headed`, or `--watch` script that an agent might run;
those block. Document them in the README for humans instead.

## tsconfig.json

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
    "skipLibCheck": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@support/*": ["src/support/*"], "@pages/*": ["src/pages/*"], "@clients/*": ["src/clients/*"], "@models/*": ["src/models/*"], "@flows/*": ["src/flows/*"] }
  },
  "include": ["src", "tests", "playwright.config.ts", "eslint.config.js"]
}
```

`tsc --noEmit` is a required gate: Playwright transpiles without type checking.

## playwright.config.ts

See `.kiro/steering/typescript-testing.md` for the full config. Non-negotiable
settings: `fullyParallel: true`, `forbidOnly: !!process.env.CI`,
`retries: process.env.CI ? 1 : 0`, `testIdAttribute: 'data-testid'`,
`trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`,
`video: 'retain-on-failure'`, `locale: 'en-US'`, `timezoneId: 'UTC'`, and both
the `junit` and `allure-playwright` reporters.

Use a `setup` project that authenticates via API and writes `storageState`,
with the browser projects declaring `dependencies: ['setup']`.

## eslint.config.js

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      'playwright/expect-expect': 'error',
      'playwright/no-force-option': 'error',
      'playwright/missing-playwright-await': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
);
```

`missing-playwright-await` and `no-floating-promises` catch the top cause of
flake in this stack. Treat both as errors, never warnings.

## Fixtures

`src/support/fixtures.ts` extends the base test with page objects, clients,
builders, and data fixtures that clean up after `use()`:

```ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend<Fixtures>({
  ordersClient: async ({ request }, use) => { await use(new OrdersClient(request)); },
  seededOrder: async ({ ordersClient }, use) => {
    const order = await ordersClient.create(orderBuilder().build());
    await use(order);
    await ordersClient.deleteIgnoringMissing(order.id);
  },
});

export { expect };
```

Every spec imports `test` and `expect` from here, never from `@playwright/test`.

## Config

`src/support/config.ts` reads `shared/environments/<env>.json` plus `AF_*`
environment variables, validates with a Zod schema, and exports a frozen typed
object. A Zod parse failure at import time is the fail-fast behaviour you want.

## Verify

```powershell
pnpm --dir typescript install --frozen-lockfile
pnpm --dir typescript lint
pnpm --dir typescript typecheck
pnpm --dir typescript exec playwright install --with-deps
pnpm --dir typescript test:smoke
```

Confirm `typescript/reports/junit.xml` and
`typescript/reports/allure-results/` are populated.
