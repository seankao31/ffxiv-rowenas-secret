# E2E Tests for OpportunityTable Sort Interactions

**Issue:** ENG-50
**Date:** 2026-04-06

## Goal

Set up Playwright E2E testing infrastructure and cover the OpportunityTable's sort-by-column behavior. This establishes the pattern for testing UI interactions that can't be covered by unit tests on pure functions.

## Infrastructure

- **Dependency:** `@playwright/test` (devDependency)
- **Config:** `playwright.config.ts` at project root
  - `webServer`: starts `bun run dev` on a fixed port (e.g. 5173)
  - `testDir`: `tests/e2e`
  - Single browser: Chromium only (fast; expand later if needed)
  - `use.baseURL`: `http://localhost:5173`
- **Directory:** `tests/e2e/` for test files, `tests/e2e/fixtures/` for test data
- **Script:** `package.json` gets `test:e2e` (`playwright test`); existing `test` stays vitest-only
- **Gitignore:** Add `test-results/`, `playwright-report/`

## Data Strategy

Tests intercept `/api/opportunities` at the network level using `page.route()` and return static fixture data. This keeps tests fast, deterministic, and focused on UI wiring rather than backend behavior.

### Fixture: `tests/e2e/fixtures/opportunities.ts`

Exports an `OpportunitiesResponse` containing:
- **5 opportunities** with distinct values for each sortable column (profitPerUnit, activeCompetitorCount, fairShareVelocity, expectedDailyProfit) so sort order is unambiguous
- **Valid `meta`** with `scanCompletedAt > 0` so the page renders the table (not loading/cold-start states)

## Test Coverage

File: `tests/e2e/opportunity-table.test.ts`

| # | Test | Verifies |
|---|------|----------|
| 1 | Table renders with fixture data | Table visible, all fixture rows present |
| 2 | Default order matches fixture order | No sort active → rows in API-returned (score-ranked) order |
| 3 | Click Gil/day → sorts descending | Rows reorder by expectedDailyProfit desc |
| 4 | Click Gil/day again → sorts ascending | Second click reverses direction |
| 5 | Third click clears sort | Returns to original API order (three-click cycle) |
| 6 | Click different column switches sort | Sort by Gil/day, then click Profit/unit → switches to profitPerUnit desc |
| 7 | Sort icon reflects state | Active sort button shows directional icon; inactive shows neutral icon |

### How row order is verified

Read the text content of a distinguishing column cell (item name or numeric value) from each `tbody tr` and compare the resulting array to the expected order.

### Selectors

- Sort buttons: `button[aria-label="Sort by {column}"]` (already in markup)
- Table structure: standard `table`, `tbody`, `tr` selectors
- No test-ids needed — existing markup has good semantics

## Out of Scope

- Other table interactions (future issue)
- Multiple browser testing
- CI integration (separate concern)
- Visual regression testing
