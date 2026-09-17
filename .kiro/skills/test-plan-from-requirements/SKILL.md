---
name: test-plan-from-requirements
description: Turn a requirement, user story, ticket, API spec, or feature description into a layered test plan — risk analysis, equivalence classes and boundaries, negative and security cases, and an explicit assignment of each case to unit, API, or UI level with tags. Use when asked what tests to write, to plan coverage for a feature, to review coverage gaps, or to convert acceptance criteria into tests.
---

# Build a Test Plan from Requirements

Output a plan, not tests. The plan is what gets reviewed and argued about
before anyone writes code — that is where the value is.

## Step 1 — Extract testable statements

Read the requirement and restate it as a list of individually verifiable
statements. Each must have an observable outcome.

Flag anything untestable as written and say what is missing:

- Vague qualifiers: "fast", "user-friendly", "handles load". Ask for the number.
- Undefined error behaviour: what does the user see, what status code.
- Undefined state transitions: what happens from each starting state.
- Missing authorization rules: who may do this, who may not.
- Missing data constraints: required, length, format, range, uniqueness.

Ambiguity found at planning time costs minutes. Found in a test, hours. Found in
production, days.

## Step 2 — Risk-rank the areas

Score each area on impact if it breaks × likelihood of breaking. Likelihood goes
up with: recent change, complexity, prior defect history, many integration
points, concurrency, money, and permissions.

Depth of coverage follows risk. Everything gets a happy path; only high-risk
areas get the exhaustive matrix. A plan that treats every field equally spends
its budget in the wrong place.

## Step 3 — Derive cases systematically

Do not brainstorm. Apply the techniques, in this order.

**Equivalence classes** — for each input, one representative valid value and one
per distinct invalid class.

**Boundaries** — for every range and length: min-1, min, min+1, max-1, max,
max+1. Off-by-one is the most common surviving defect.

**Special values** — empty, whitespace-only, null, zero, negative, very long,
unicode and emoji, leading/trailing spaces, mixed case, injection-shaped
strings (`'; DROP`, `<script>`, `{{7*7}}`, `../../`).

**Decision table** — for rules with multiple conditions, enumerate the
combinations and mark the outcome. Then cut to the distinct outcomes plus each
condition toggled once.

**State transitions** — draw the states, then cover every legal transition once
and the illegal ones you can trigger (cancel an already-cancelled order,
double-submit, act after expiry).

**Pairwise** — when several independent parameters exist, cover all pairs rather
than the full cross product. States the reduction explicitly so reviewers know
what is not covered.

**Sequences** — retry, refresh mid-flow, browser back, resubmit, concurrent
edit, session expiry mid-action.

## Step 4 — Add the categories people forget

- **Authorization**: anonymous, wrong role, right role, and **cross-tenant**.
  Cross-tenant access is the most commonly missed high-severity gap.
- **Error handling**: dependency down, timeout, malformed upstream response.
  Assert the user-facing behaviour and that no internal detail leaks.
- **Idempotency and concurrency**: double-click, duplicate submit, stale
  version, simultaneous edit.
- **Data lifecycle**: create, read, update, delete, and delete-then-read.
- **Pagination, sorting, filtering**: including empty and beyond-end.
- **Time**: timezone, DST, month/year boundaries, expiry.
- **Localisation**: if multi-locale, at least one non-Latin locale and one
  right-to-left where supported.
- **Accessibility**: keyboard-only path and an automated scan for new screens.
- **Observability**: does a failure produce a usable log and alert.

## Step 5 — Assign each case to a level

This is the most important column. Push every case as far down as it can go.

| Level    | Use for                                                       | Tag         |
| -------- | ------------------------------------------------------------- | ----------- |
| Unit     | Pure logic, calculations, formatting, edge-case math           | app repo    |
| API      | Business rules, validation matrices, permissions, error shapes, pagination, idempotency | `regression` / `contract` |
| UI       | Critical journeys, rendering, client-side behaviour, a11y      | `smoke` / `regression` |
| Manual   | Exploratory, visual judgement, one-off migration verification  | not automated |

Rules:

- A validation matrix belongs at the API level. Not the UI.
- A rule already covered by an API test does not get a UI test too.
- Only the critical path gets a `smoke` tag. Smoke must stay under 5 minutes.
- Mark cases you are deliberately not automating, with the reason. An honest
  "not automated: low risk, high cost" is better than a silent gap.

## Step 6 — Produce the plan

```markdown
# Test Plan: <feature> (<ticket>)

## Testable statements
1. ...

## Open questions / ambiguities
- ...

## Risk ranking
| Area | Impact | Likelihood | Depth |

## Cases
| # | Case | Technique | Level | Suite | Data needed | Expected | Priority |
|---|------|-----------|-------|-------|-------------|----------|----------|

## Not automated
| Case | Reason |

## Prerequisites
- Test accounts and roles needed
- Data setup path (API endpoint / seed / container)
- Contract additions needed in shared/contracts/
- Missing data-testid attributes to request from the app team

## Estimated suite impact
- New tests: n API, n UI
- Expected added runtime: smoke +Xs, regression +Ys
```

## Step 7 — Review the plan before writing code

Check it yourself against these questions:

- Is every acceptance criterion covered by at least one case?
- Is any case at a higher level than it needs to be?
- Are the negative paths as detailed as the happy path?
- Is there a cross-tenant / privilege-escalation case?
- Does every case have a clear, single expected outcome?
- Can each case's data be created and cleaned up independently?
- Does the smoke selection still fit the time budget?
- Is anything in the plan already covered by an existing test? Check before
  adding a duplicate.
