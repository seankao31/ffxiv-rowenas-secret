# Playwright Mobile Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Each task includes cross-model verification via codex-review-gate after code quality review, with a final cross-task codex review before branch completion.

**Goal:** Add a Playwright `mobile` project so all e2e tests run at both desktop and mobile viewports automatically, replacing per-test viewport overrides.

**Architecture:** Two Playwright projects (`desktop` and `mobile`) with filename-based filtering (`*.mobile.test.ts` / `*.desktop.test.ts`). Redistribute `mobile-layout.test.ts` tests by feature. Extract shared arbitrage mock helper to reduce duplication.

**Tech Stack:** Playwright, TypeScript

---

### Task 1: Extract shared arbitrage mock helper

Three test files (`mobile-layout.test.ts`, `opportunity-table.test.ts`, `buy-route.test.ts`) have identical `mockApi` functions. Extract to a shared helper before redistributing tests.

**Files:**
- Create: `tests/e2e/fixtures/mock-arbitrage-api.ts`
- Modify: `tests/e2e/opportunity-table.test.ts:8-19`
- Modify: `tests/e2e/buy-route.test.ts:4-13`

- [x] **Step 1: Create the shared helper**

```ts
// tests/e2e/fixtures/mock-arbitrage-api.ts
import type { Page } from '@playwright/test'
import { opportunities, meta } from './opportunities'

export async function mockArbitrageApi(page: Page) {
  await page.route('**/api/opportunities**', async route => {
    await route.fulfill({ json: { opportunities, meta } })
  })
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
  await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
  await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
}
```

- [x] **Step 2: Update `opportunity-table.test.ts` to use shared helper**

Replace the inline `mockApi` function and its import of fixtures. The file should import `mockArbitrageApi` from `./fixtures/mock-arbitrage-api` instead. The `opportunities` import is still needed for `DEFAULT_ORDER` and the inline re-mock in the "copy button is hidden" and "vendor-sell display" tests, so keep it.

```ts
// Replace lines 1-19:
import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

// Fixture items are ordered by score desc (the API's default):
// Alpha Draught, Beta Elixir, Gamma Ingot, Delta Cloth, Epsilon Ore
const DEFAULT_ORDER = opportunities.map(o => o.itemName)
```

In `beforeEach`, replace `await mockApi(page)` with `await mockArbitrageApi(page)`.

Delete the inline `mockApi` function (old lines 8-19).

- [x] **Step 3: Update `buy-route.test.ts` to use shared helper**

Replace the inline `mockApi` function. Import `mockArbitrageApi` from `./fixtures/mock-arbitrage-api`. Replace `mockApi(page)` calls with `mockArbitrageApi(page)`.

```ts
// Replace lines 1-13:
import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'
```

Delete the inline `mockApi` function (old lines 4-13). Replace all `mockApi(page)` calls with `mockArbitrageApi(page)`.

- [x] **Step 4: Run e2e tests to verify nothing broke**

Run: `bunx playwright test --reporter=list 2>&1`
Expected: All existing tests pass. No behavior change.

- [x] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/mock-arbitrage-api.ts tests/e2e/opportunity-table.test.ts tests/e2e/buy-route.test.ts
git commit -m "refactor(e2e): extract shared mockArbitrageApi helper

Ref: ENG-89"
```

---

### Task 2: Add desktop and mobile projects to Playwright config

**Files:**
- Modify: `playwright.config.ts`

- [x] **Step 1: Write the failing test — verify config has two projects**

No unit test needed here — this is pure config. We'll verify by running Playwright with `--list` to confirm both projects are recognized.

- [x] **Step 2: Update `playwright.config.ts`**

Replace the single `chromium` project with `desktop` and `mobile`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /\.mobile\.test\.ts$/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testIgnore: [/\.desktop\.test\.ts$/, /craft-api\.test\.ts$/],
    },
  ],
  webServer: {
    command: 'bun run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
  },
})
```

- [x] **Step 3: Verify both projects are recognized**

Run: `bunx playwright test --list 2>&1 | head -20`
Expected: Test names prefixed with `[desktop]` and `[mobile]`. Each non-excluded test appears twice.

- [x] **Step 4: Run e2e tests to see which tests pass/fail at mobile viewport**

Run: `bunx playwright test --reporter=list 2>&1`

Some tests may fail at mobile viewport — that's expected and will be addressed. Note any failures for investigation. The mobile-layout tests will still pass because they have inline `test.use({ viewport })` overrides that take precedence over the project device config.

- [x] **Step 5: Commit**

```bash
git add playwright.config.ts
git commit -m "feat(e2e): add desktop and mobile Playwright projects

Ref: ENG-89"
```

---

### Task 3: Create `nav-drawer.mobile.test.ts`

Extract the nav/drawer tests from `mobile-layout.test.ts` into a mobile-only test file.

**Files:**
- Create: `tests/e2e/nav-drawer.mobile.test.ts`

- [x] **Step 1: Create the mobile-only nav drawer test file**

These tests come from `mobile-layout.test.ts` lines 22-49. Remove `test.use({ viewport })` — the mobile project provides 390×844 via `devices['iPhone 14']`.

```ts
// tests/e2e/nav-drawer.mobile.test.ts
import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('nav drawer', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('sidebar is hidden on mobile', async ({ page }) => {
    await expect(page.locator('nav')).toBeHidden()
  })

  test('hamburger button is visible on mobile', async ({ page }) => {
    await expect(page.locator('button[aria-label="Open menu"]')).toBeVisible()
  })

  test('clicking hamburger opens navigation drawer', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    await expect(page.locator('[data-testid="nav-drawer"] a')).toHaveCount(1) // Arbitrage
  })

  test('drawer closes when clicking backdrop', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    await page.locator('[data-testid="nav-drawer-backdrop"]').click({ position: { x: 350, y: 400 } })
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeHidden()
  })

  test('drawer closes on Escape key', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeHidden()
  })
})
```

- [x] **Step 2: Run the new test file to verify it passes**

Run: `bunx playwright test nav-drawer.mobile --project=mobile --reporter=list 2>&1`
Expected: 5 tests pass. The file only runs in the mobile project (desktop ignores `*.mobile.test.ts`).

- [x] **Step 3: Commit**

```bash
git add tests/e2e/nav-drawer.mobile.test.ts
git commit -m "feat(e2e): add nav-drawer.mobile.test.ts from mobile-layout tests

Ref: ENG-89"
```

---

### Task 4: Create `opportunity-table.mobile.test.ts`

Extract the arbitrage table mobile-specific tests (sticky column, horizontal scroll, controls stacking) into a mobile-only test file.

**Files:**
- Create: `tests/e2e/opportunity-table.mobile.test.ts`

- [x] **Step 1: Create the mobile-only opportunity table test file**

These tests come from `mobile-layout.test.ts` lines 51-88. Remove `test.use({ viewport })`.

```ts
// tests/e2e/opportunity-table.mobile.test.ts
import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('opportunity table mobile layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('item column stays visible while scrolling table horizontally', async ({ page }) => {
    const table = page.locator('table')
    const firstItemLink = table.locator('tbody tr:first-child td:first-child a')

    await expect(firstItemLink).toBeVisible()

    const container = page.locator('[data-testid="table-container"]')
    await container.evaluate(el => { el.scrollLeft = 300 })

    await expect(firstItemLink).toBeInViewport()
  })

  test('table scrolls horizontally on mobile', async ({ page }) => {
    const container = page.locator('[data-testid="table-container"]')
    const scrollWidth = await container.evaluate(el => el.scrollWidth)
    const clientWidth = await container.evaluate(el => el.clientWidth)
    expect(scrollWidth).toBeGreaterThan(clientWidth)
  })

  test('threshold controls stack vertically on mobile', async ({ page }) => {
    await page.click('text=Scan Parameters')
    const container = page.locator('[data-testid="threshold-controls-body"]')
    await expect(container).toBeVisible()
    const labels = container.locator('label')
    const first = await labels.nth(0).boundingBox()
    const second = await labels.nth(1).boundingBox()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second!.y).toBeGreaterThan(first!.y + first!.height / 2)
  })
})
```

- [x] **Step 2: Run the new test file to verify it passes**

Run: `bunx playwright test opportunity-table.mobile --project=mobile --reporter=list 2>&1`
Expected: 3 tests pass.

- [x] **Step 3: Commit**

```bash
git add tests/e2e/opportunity-table.mobile.test.ts
git commit -m "feat(e2e): add opportunity-table.mobile.test.ts from mobile-layout tests

Ref: ENG-89"
```

---

### Task 5: Delete `mobile-layout.test.ts`

All tests have been redistributed. Delete the original file.

**Files:**
- Delete: `tests/e2e/mobile-layout.test.ts`

- [x] **Step 1: Delete the file**

```bash
git rm tests/e2e/mobile-layout.test.ts
```

- [x] **Step 2: Run the full e2e suite to verify nothing is missing**

Run: `bunx playwright test --reporter=list 2>&1`

Expected: All tests pass. The nav-drawer and opportunity-table mobile tests run in the mobile project. The "desktop layout unchanged" tests (sidebar visible, hamburger hidden) are intentionally dropped — they were redundant inverses.

Compare test counts:
- Old: 9 tests from `mobile-layout.test.ts` (7 mobile + 2 desktop)
- New: 5 in `nav-drawer.mobile.test.ts` + 3 in `opportunity-table.mobile.test.ts` = 8 (dropped 2 desktop-inverse tests, added 1 link count test that was already there)

Wait — the count should be: 5 nav-drawer + 3 opportunity-table = 8 mobile-only tests, vs. the original 7 mobile + 2 desktop = 9. We dropped the 2 desktop-inverse tests and kept the 7 mobile tests minus... let me recount. The original had exactly: sidebar hidden, hamburger visible, drawer open, drawer close backdrop, drawer close escape (5 nav) + sticky column, horizontal scroll, controls stacking (3 table) = 8 mobile tests + 2 desktop tests = 10 total. We're keeping 8, dropping 2. Good.

- [x] **Step 3: Commit**

```bash
git commit -m "refactor(e2e): delete mobile-layout.test.ts, tests redistributed by feature

Ref: ENG-89"
```

---

### Task 6: Fix any tests that fail at mobile viewport

After Tasks 1-5, the full suite runs all non-mobile-only tests at both viewports. Some tests in `buy-route.test.ts` or `item-detail.test.ts` may fail at 390×844 due to bounding-box assertions or layout assumptions.

**Files:**
- Possibly modify: `tests/e2e/buy-route.test.ts`
- Possibly modify: `tests/e2e/item-detail.test.ts`
- Possibly modify: any other failing test file

- [x] **Step 1: Run the full suite and capture failures**

Run: `bunx playwright test --reporter=list 2>&1`

Note which tests fail and in which project (desktop vs mobile).

- [x] **Step 2: Investigate each failure**

For each failing test, determine whether the failure is:
- **A real mobile layout bug** in the app code → fix the app code
- **A test that only makes sense at one viewport** → move it to a `*.mobile.test.ts` or `*.desktop.test.ts` file
- **A bounding-box assertion that needs to be viewport-aware** → adjust the assertion

This step is intentionally open-ended — the specific failures can't be predicted until the suite runs at mobile viewport for the first time.

- [x] **Step 3: Run the full suite again to verify all fixes**

Run: `bunx playwright test --reporter=list 2>&1`
Expected: All tests pass in both projects.

- [x] **Step 4: Commit fixes**

```bash
git add -u
git commit -m "fix(e2e): resolve test failures at mobile viewport

Ref: ENG-89"
```

---

### Task 7: Final verification and cleanup

- [x] **Step 1: Run the full e2e suite one last time**

Run: `bunx playwright test --reporter=list 2>&1`
Expected: All tests pass in both `desktop` and `mobile` projects.

- [x] **Step 2: Run vitest to confirm no unit test regressions**

Run: `bun run test 2>&1`
Expected: All 264 unit tests pass.

- [x] **Step 3: Verify test distribution looks correct**

Run: `bunx playwright test --list 2>&1`

Verify:
- `*.mobile.test.ts` files only appear under `[mobile]`
- `craft-api.test.ts` only appears under `[desktop]`
- All other test files appear under both `[desktop]` and `[mobile]`

- [x] **Step 4: Commit any final cleanup**

Only if needed. If everything is clean, skip this step.
