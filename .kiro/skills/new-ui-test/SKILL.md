---
name: new-ui-test
description: Add a browser/UI test with its page objects, locators, fixtures, and data setup in C#, Java, Python, or TypeScript. Enforces page object separation, semantic locators, no sleeps, API-based data seeding, and failure artifacts. Use when asked to write, add, or convert a UI, browser, end-to-end, or Playwright/Selenium test.
---

# Add a UI Test

## Step 0 — Challenge the level

Before writing a browser test, ask whether the behaviour needs a browser.

Push it down to an API test if it is a business rule, a validation matrix, a
permission check, or an error-handling case. UI tests are for journeys,
rendering, client-side behaviour, and accessibility.

If the request is for a 20-case UI validation matrix, say so and propose one UI
test for the happy path plus API tests for the matrix. State this once, then
follow the user's decision.

## Step 1 — Write down the scenario before the code

Fill this in, in one line each:

- **Requirement / ticket:** the id that justifies the test.
- **Precondition:** the state the app must be in.
- **Actor:** which role/account.
- **Action:** the single user action under test.
- **Expected:** the observable outcome, in the exact words the UI shows where
  applicable.
- **Cleanup:** what must be removed afterwards.

If "Expected" needs an "and", split into two tests.

## Step 2 — Set up state the fast way

Never build preconditions through the UI. In order of preference: API client,
seed endpoint, database. The UI is only used for the action under test.

- Data comes from a builder, unique per run via the run id.
- Register cleanup at creation, so it runs when the test fails mid-way.
- Auth comes from the reused `storageState`, not a UI login.

If a needed API client method does not exist, add it to `clients/` first.

## Step 3 — Page objects before the test

For each screen or region the test touches:

- Reuse an existing page/component object if one covers the region. Check
  first; duplicated page objects are a common decay pattern.
- New locators go in the constructor as readonly properties.
- Locator priority: `data-testid` → role + accessible name → label/text →
  scoped CSS → XPath as a last resort. If the app has no test id and the
  element is genuinely ambiguous, note that a `data-testid` should be added to
  the app and use the best available alternative meanwhile.
- Methods named for intent, returning nothing or a value. **No assertions.**
- A complex region (table, modal, nav) becomes its own component object.

## Step 4 — Compose a flow if the sequence is reusable

Two or more tests needing the same multi-step sequence means it belongs in
`flows/`. Wrap flow methods in a reporting step (`test.step`, `@Step`,
`allure.step`, `AllureApi.Step`) so the report reads like the scenario.

## Step 5 — Write the test

Structure: arrange, act, assert. One act.

- Test name follows the module's convention and describes expected + condition.
- Tag it: `smoke` for critical path, otherwise `regression`.
- Link the requirement via the framework's annotation.
- Assertions use web-first, auto-retrying assertions on locators
  (`expect(locator).toHaveText`, `Assertions.Expect`, `assertThat(locator)`,
  `expect(locator).to_have_text`) rather than reading a value then comparing.
- Add a `because`/`as`/message explaining the business rule.
- No selector strings, no sleeps, no conditionals, no try/catch.

## Step 6 — Prove it

1. Run the single test headless. It must pass.
2. Run it 10 times in a row. Every run must pass. Flake that appears at run 7
   is flake you have shipped.
3. Run it with the full parallel worker count alongside its sibling tests.
4. Break the expected value deliberately, confirm the failure message is
   readable and the artifacts (screenshot, trace, HTML) attach to the report,
   then restore it.
5. Run lint, format, and type check.

Report the commands you ran and their results. If you could not run the suite
(no environment, missing credentials), say so explicitly rather than implying
the test passed.

## Checklist before declaring done

- [ ] Requirement id linked
- [ ] One reason to fail
- [ ] Data created via API, unique, cleaned up idempotently
- [ ] No login through the UI
- [ ] All locators in page objects, semantic and stable
- [ ] No assertions in page objects
- [ ] No sleep, no `waitForTimeout`, no `networkidle` as a general wait
- [ ] No conditionals or try/catch in the test
- [ ] Tagged, and excluded from nothing it should be in
- [ ] Web-first assertions with messages
- [ ] Plain, readable code: no LINQ/stream/`reduce` chains, no nested
      ternaries, no lambdas longer than one statement
- [ ] Passed 10 consecutive runs and one parallel run
- [ ] Failure path verified once
- [ ] Lint, format, type check clean
