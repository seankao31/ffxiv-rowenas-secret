# E2E Sort Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Playwright E2E testing and verify OpportunityTable sort-by-column interactions.

**Architecture:** Playwright connects to the SvelteKit dev server via `webServer` config. Tests intercept `/api/opportunities` with `page.route()` to return static fixture data, and block external XIVAPI calls. All sort behavior is verified by reading row order from the DOM.

**Tech Stack:** @playwright/test, SvelteKit dev server, Chromium

---

## File Structure

| File | Purpose |
|------|---------|
| `playwright.config.ts` (create) | Playwright configuration — webServer, testDir, Chromium project |
| `package.json` (modify) | Add `test:e2e` script, `@playwright/test` devDependency |
| `.gitignore` (modify) | Add `test-results/`, `playwright-report/` |
| `tests/e2e/fixtures/opportunities.ts` (create) | Static fixture data for API mock |
| `tests/e2e/opportunity-table.test.ts` (create) | E2E tests for table rendering and sort interactions |

---

### Task 1: Install Playwright and create config

**Files:**
- Modify: `package.json` (add devDependency + script)
- Create: `playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install @playwright/test**

```bash
bun add -d @playwright/test
```

- [ ] **Step 2: Install Chromium browser binary**

```bash
bunx playwright install chromium
```

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 4: Add `test:e2e` script to `package.json`**

Add to the `"scripts"` section:

```json
"test:e2e": "playwright test"
```

Do NOT modify the existing `"test"` script — it stays as `vitest run`.

- [ ] **Step 5: Add Playwright output dirs to `.gitignore`**

Append to `.gitignore`:

```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 6: Verify unit tests still pass**

```bash
bun test
```

Expected: All existing tests pass. The vitest `include` pattern (`tests/**/*.test.ts`) will match E2E files too, but there are none yet.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts package.json bun.lock .gitignore
git commit -m "chore: add Playwright E2E infrastructure (ENG-50)"
```

---

### Task 2: Smoke test — Playwright can start the dev server

**Files:**
- Create: `tests/e2e/opportunity-table.test.ts`

This is a minimal test to prove the wiring works before adding fixtures.

- [ ] **Step 1: Create the smoke test**

Create `tests/e2e/opportunity-table.test.ts`:

```ts
import { test, expect } from '@playwright/test'

test('dev server starts and page loads', async ({ page }) => {
  await page.goto('/arbitrage')
  await expect(page).toHaveTitle(/.*/)
})
```

- [ ] **Step 2: Run the E2E test**

```bash
bun run test:e2e
```

Expected: PASS — Playwright starts the dev server and navigates successfully.

- [ ] **Step 3: Verify unit tests still pass and exclude E2E files**

The vitest `include` pattern `tests/**/*.test.ts` will match our new E2E file. Update `vite.config.ts` test config to exclude E2E:

In `vite.config.ts`, change the `test` section to:

```ts
test: {
  include: ['tests/**/*.test.ts'],
  exclude: ['tests/e2e/**'],
},
```

Run:

```bash
bun test
```

Expected: All unit tests pass. The E2E file is not picked up by vitest.

- [ ] **Step 4: Run E2E again to confirm it still works after vite.config change**

```bash
bun run test:e2e
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/opportunity-table.test.ts vite.config.ts
git commit -m "test(e2e): add smoke test to verify Playwright wiring (ENG-50)"
```

---

### Task 3: Create fixture data and API mock helper

**Files:**
- Create: `tests/e2e/fixtures/opportunities.ts`

The fixture provides 5 opportunities with distinct values per sortable column so that every sort produces a unique, verifiable row order.

| Item | profitPerUnit | activeCompetitorCount | fairShareVelocity | expectedDailyProfit | score |
|------|--------------|----------------------|-------------------|--------------------|----|
| Alpha Draught | 500 | 2 | 3.0 | 1500 | 90 |
| Beta Elixir | 300 | 5 | 1.0 | 300 | 80 |
| Gamma Ingot | 100 | 1 | 5.0 | 500 | 70 |
| Delta Cloth | 400 | 3 | 2.0 | 800 | 60 |
| Epsilon Ore | 200 | 4 | 4.0 | 1000 | 50 |

Default API order (by score desc): Alpha, Beta, Gamma, Delta, Epsilon

Expected sort orders:
- **expectedDailyProfit desc:** Alpha(1500), Epsilon(1000), Delta(800), Gamma(500), Beta(300)
- **expectedDailyProfit asc:** Beta(300), Gamma(500), Delta(800), Epsilon(1000), Alpha(1500)
- **profitPerUnit desc:** Alpha(500), Delta(400), Beta(300), Epsilon(200), Gamma(100)
- **activeCompetitorCount asc:** Gamma(1), Alpha(2), Delta(3), Epsilon(4), Beta(5)
- **fairShareVelocity desc:** Gamma(5.0), Epsilon(4.0), Alpha(3.0), Delta(2.0), Beta(1.0)

- [ ] **Step 1: Create the fixture file**

Create `tests/e2e/fixtures/opportunities.ts`:

```ts
import type { Opportunity } from '$lib/shared/types'
import type { ScanMeta } from '$lib/shared/types'

export const opportunities: Opportunity[] = [
  {
    itemID: 101, itemName: 'Alpha Draught',
    buyPrice: 500, sellPrice: 1100, listingPrice: 1100,
    profitPerUnit: 500, listingProfitPerUnit: 500,
    sourceWorld: 'Carbuncle', sourceWorldID: 45,
    availableUnits: 10, recommendedUnits: 5,
    expectedDailyProfit: 1500, score: 90,
    homeDataAgeHours: 0.5, homeConfidence: 0.9,
    sourceDataAgeHours: 0.3, sourceConfidence: 0.95,
    activeCompetitorCount: 2, fairShareVelocity: 3.0,
  },
  {
    itemID: 102, itemName: 'Beta Elixir',
    buyPrice: 200, sellPrice: 560, listingPrice: 560,
    profitPerUnit: 300, listingProfitPerUnit: 300,
    sourceWorld: 'Kujata', sourceWorldID: 49,
    availableUnits: 8, recommendedUnits: 3,
    expectedDailyProfit: 300, score: 80,
    homeDataAgeHours: 1.2, homeConfidence: 0.8,
    sourceDataAgeHours: 0.8, sourceConfidence: 0.85,
    activeCompetitorCount: 5, fairShareVelocity: 1.0,
  },
  {
    itemID: 103, itemName: 'Gamma Ingot',
    buyPrice: 400, sellPrice: 530, listingPrice: 530,
    profitPerUnit: 100, listingProfitPerUnit: 100,
    sourceWorld: 'Tonberry', sourceWorldID: 46,
    availableUnits: 20, recommendedUnits: 10,
    expectedDailyProfit: 500, score: 70,
    homeDataAgeHours: 0.2, homeConfidence: 0.95,
    sourceDataAgeHours: 0.1, sourceConfidence: 0.98,
    activeCompetitorCount: 1, fairShareVelocity: 5.0,
  },
  {
    itemID: 104, itemName: 'Delta Cloth',
    buyPrice: 300, sellPrice: 750, listingPrice: 750,
    profitPerUnit: 400, listingProfitPerUnit: 400,
    sourceWorld: 'Aegis', sourceWorldID: 90,
    availableUnits: 15, recommendedUnits: 7,
    expectedDailyProfit: 800, score: 60,
    homeDataAgeHours: 2.0, homeConfidence: 0.7,
    sourceDataAgeHours: 1.5, sourceConfidence: 0.75,
    activeCompetitorCount: 3, fairShareVelocity: 2.0,
  },
  {
    itemID: 105, itemName: 'Epsilon Ore',
    buyPrice: 800, sellPrice: 1050, listingPrice: 1050,
    profitPerUnit: 200, listingProfitPerUnit: 200,
    sourceWorld: 'Atomos', sourceWorldID: 68,
    availableUnits: 12, recommendedUnits: 6,
    expectedDailyProfit: 1000, score: 50,
    homeDataAgeHours: 0.8, homeConfidence: 0.85,
    sourceDataAgeHours: 0.5, sourceConfidence: 0.9,
    activeCompetitorCount: 4, fairShareVelocity: 4.0,
  },
]

export const meta: ScanMeta = {
  scanCompletedAt: Date.now(),
  itemsScanned: 500,
  itemsWithOpportunities: 5,
  nextScanEstimatedAt: Date.now() + 30_000,
}
```

- [ ] **Step 2: Verify the fixture file compiles**

```bash
bunx tsc --noEmit tests/e2e/fixtures/opportunities.ts 2>&1 || true
```

Note: This may fail because the file uses `$lib` path aliases. That's expected — Playwright will use the SvelteKit dev server for resolution. What matters is no syntax errors. Alternatively, check by running:

```bash
bun run typecheck
```

If the typecheck script doesn't cover `tests/e2e/`, just confirm no syntax errors visually.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/opportunities.ts
git commit -m "test(e2e): add opportunity fixture data for sort tests (ENG-50)"
```

---

### Task 4: Table rendering and default order tests

**Files:**
- Modify: `tests/e2e/opportunity-table.test.ts`

Replace the smoke test with the real test file. All tests share a `beforeEach` that mocks the API and blocks XIVAPI.

- [ ] **Step 1: Rewrite the test file with rendering + default order tests**

Replace `tests/e2e/opportunity-table.test.ts` with:

```ts
import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'

// Note: fixture items are ordered by score desc (the API's default):
// Alpha Draught, Beta Elixir, Gamma Ingot, Delta Cloth, Epsilon Ore
const DEFAULT_ORDER = opportunities.map(o => o.itemName)

async function mockApi(page: Page) {
  await page.route('**/api/opportunities**', async route => {
    await route.fulfill({
      json: { opportunities, meta },
    })
  })
  // Block XIVAPI calls to keep tests offline and fast
  await page.route('**/v2.xivapi.com/**', route => route.abort())
}

/** Read item names from the first column of each table body row. */
async function getRowNames(page: Page): Promise<string[]> {
  return page.locator('table tbody tr td:first-child').allTextContents()
}

test.describe('OpportunityTable', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('renders all fixture rows', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(opportunities.length)
  })

  test('default order matches API order (by score)', async ({ page }) => {
    const names = await getRowNames(page)
    expect(names).toEqual(DEFAULT_ORDER)
  })
})
```

- [ ] **Step 2: Run E2E tests**

```bash
bun run test:e2e
```

Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/opportunity-table.test.ts
git commit -m "test(e2e): add table rendering and default order tests (ENG-50)"
```

---

### Task 5: Three-click sort cycle tests (Gil/day column)

**Files:**
- Modify: `tests/e2e/opportunity-table.test.ts`

Add tests for the complete three-click cycle on the Gil/day (expectedDailyProfit) column: desc → asc → clear.

- [ ] **Step 1: Add the three-click cycle tests**

Add inside the existing `test.describe('OpportunityTable', ...)` block, after the default order test:

```ts
  test('click Gil/day sorts descending', async ({ page }) => {
    await page.click('button[aria-label="Sort by expectedDailyProfit"]')
    const names = await getRowNames(page)
    // expectedDailyProfit desc: 1500, 1000, 800, 500, 300
    expect(names).toEqual([
      'Alpha Draught', 'Epsilon Ore', 'Delta Cloth', 'Gamma Ingot', 'Beta Elixir',
    ])
  })

  test('click Gil/day twice sorts ascending', async ({ page }) => {
    const btn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    await btn.click()
    await btn.click()
    const names = await getRowNames(page)
    // expectedDailyProfit asc: 300, 500, 800, 1000, 1500
    expect(names).toEqual([
      'Beta Elixir', 'Gamma Ingot', 'Delta Cloth', 'Epsilon Ore', 'Alpha Draught',
    ])
  })

  test('click Gil/day three times clears sort (returns to default)', async ({ page }) => {
    const btn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    await btn.click()
    await btn.click()
    await btn.click()
    const names = await getRowNames(page)
    expect(names).toEqual(DEFAULT_ORDER)
  })
```

- [ ] **Step 2: Run E2E tests**

```bash
bun run test:e2e
```

Expected: 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/opportunity-table.test.ts
git commit -m "test(e2e): add three-click sort cycle tests for Gil/day (ENG-50)"
```

---

### Task 6: Column switching and sort icon state tests

**Files:**
- Modify: `tests/e2e/opportunity-table.test.ts`

Add the remaining two tests: switching between columns, and verifying sort icon visual state.

- [ ] **Step 1: Add column switching test**

Add inside the `test.describe` block:

```ts
  test('clicking a different column switches sort', async ({ page }) => {
    // Sort by Gil/day first
    await page.click('button[aria-label="Sort by expectedDailyProfit"]')
    // Then switch to Profit/unit
    await page.click('button[aria-label="Sort by profitPerUnit"]')
    const names = await getRowNames(page)
    // profitPerUnit desc: 500, 400, 300, 200, 100
    expect(names).toEqual([
      'Alpha Draught', 'Delta Cloth', 'Beta Elixir', 'Epsilon Ore', 'Gamma Ingot',
    ])
  })
```

- [ ] **Step 2: Add sort icon state test**

Add inside the `test.describe` block:

```ts
  test('sort icon reflects active state', async ({ page }) => {
    const gilDayBtn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    const profitBtn = page.locator('button[aria-label="Sort by profitPerUnit"]')

    // Before clicking: all icons should have opacity-50 (inactive)
    await expect(gilDayBtn.locator('svg')).toHaveClass(/opacity-50/)
    await expect(profitBtn.locator('svg')).toHaveClass(/opacity-50/)

    // Click Gil/day: its icon becomes active (opacity-90), others stay inactive
    await gilDayBtn.click()
    await expect(gilDayBtn.locator('svg')).toHaveClass(/opacity-90/)
    await expect(profitBtn.locator('svg')).toHaveClass(/opacity-50/)

    // Click Profit/unit: it becomes active, Gil/day goes back to inactive
    await profitBtn.click()
    await expect(profitBtn.locator('svg')).toHaveClass(/opacity-90/)
    await expect(gilDayBtn.locator('svg')).toHaveClass(/opacity-50/)
  })
```

- [ ] **Step 3: Run E2E tests**

```bash
bun run test:e2e
```

Expected: 7 tests PASS.

- [ ] **Step 4: Run unit tests to confirm no regressions**

```bash
bun test
```

Expected: All unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/opportunity-table.test.ts
git commit -m "test(e2e): add column switching and icon state tests (ENG-50)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run the full E2E suite**

```bash
bun run test:e2e
```

Expected: 7 tests PASS across all test cases:
1. renders all fixture rows
2. default order matches API order (by score)
3. click Gil/day sorts descending
4. click Gil/day twice sorts ascending
5. click Gil/day three times clears sort (returns to default)
6. clicking a different column switches sort
7. sort icon reflects active state

- [ ] **Step 2: Run unit tests**

```bash
bun test
```

Expected: All existing unit tests pass.

- [ ] **Step 3: Final commit if any cleanup needed**

Only commit if there were adjustments needed during verification. Otherwise, the work is complete.
