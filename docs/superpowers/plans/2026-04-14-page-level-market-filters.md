# Page-Level Market Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task includes cross-model verification via codex-review-gate after code quality review, with a final cross-task codex review before branch completion.

**Goal:** Promote world and HQ filters from ListingsTable to page level so they apply consistently across Cross-World Listings, Sale History, and Price Statistics.

**Architecture:** Create a shared `applyMarketFilters` helper in `src/lib/client/market-filters.ts`. Move filter state (`selectedWorld`, `hqOnly`) to `+page.svelte` and render filter controls there. Pass filter values as props to `ListingsTable` and `SaleHistoryTable`; pass pre-filtered sales to `PriceStats`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-04-14-page-level-market-filters-design.md`

**Worktree:** `.worktrees/eng-132-promote-filters` (branch `eng-132-promote-world-and-hq-filters-to-page-level-across-all-item`)

---

### Task 1: Create `applyMarketFilters` helper with unit tests

**Files:**
- Create: `src/lib/client/market-filters.ts`
- Create: `tests/client/market-filters.test.ts`

- [x] **Step 1: Write the failing tests**

In `tests/client/market-filters.test.ts`:

```ts
import { test, expect, describe } from 'vitest'
import { applyMarketFilters } from '$lib/client/market-filters'

const items = [
  { worldName: '利維坦', hq: true, price: 100 },
  { worldName: '伊弗利特', hq: false, price: 200 },
  { worldName: '利維坦', hq: false, price: 300 },
  { worldName: '鳳凰', hq: true, price: 400 },
]

describe('applyMarketFilters', () => {
  test('returns all items when no filters active', () => {
    const result = applyMarketFilters(items, 'all', false)
    expect(result).toEqual(items)
  })

  test('filters by world', () => {
    const result = applyMarketFilters(items, '利維坦', false)
    expect(result).toEqual([
      { worldName: '利維坦', hq: true, price: 100 },
      { worldName: '利維坦', hq: false, price: 300 },
    ])
  })

  test('filters by HQ only', () => {
    const result = applyMarketFilters(items, 'all', true)
    expect(result).toEqual([
      { worldName: '利維坦', hq: true, price: 100 },
      { worldName: '鳳凰', hq: true, price: 400 },
    ])
  })

  test('filters by both world and HQ', () => {
    const result = applyMarketFilters(items, '利維坦', true)
    expect(result).toEqual([
      { worldName: '利維坦', hq: true, price: 100 },
    ])
  })

  test('returns empty array when nothing matches', () => {
    const result = applyMarketFilters(items, '鳳凰', false)
    const hqResult = applyMarketFilters(result, 'all', true)
    // 鳳凰 has one HQ item, but let's test a world with no HQ
    const noMatch = applyMarketFilters(items, '伊弗利特', true)
    expect(noMatch).toEqual([])
  })

  test('returns empty array for empty input', () => {
    const result = applyMarketFilters([], 'all', false)
    expect(result).toEqual([])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun run test tests/client/market-filters.test.ts`
Expected: FAIL — module `$lib/client/market-filters` not found

- [x] **Step 3: Write the implementation**

In `src/lib/client/market-filters.ts`:

```ts
type Filterable = { worldName: string; hq: boolean }

export function applyMarketFilters<T extends Filterable>(
  items: T[],
  selectedWorld: string,
  hqOnly: boolean,
): T[] {
  let result = items
  if (selectedWorld !== 'all') {
    result = result.filter(item => item.worldName === selectedWorld)
  }
  if (hqOnly) {
    result = result.filter(item => item.hq)
  }
  return result
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/client/market-filters.test.ts`
Expected: 6 tests PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/client/market-filters.ts tests/client/market-filters.test.ts
git commit -m "feat(ui): add applyMarketFilters helper with unit tests

Ref: ENG-132"
```

---

### Task 2: Update `ListingsTable` — remove filter UI, accept filter props

**Files:**
- Modify: `src/lib/components/ListingsTable.svelte`

- [x] **Step 1: Update the component**

In `src/lib/components/ListingsTable.svelte`:

1. Add `selectedWorld` and `hqOnly` to props (remove from local `$state`):

Replace:
```ts
let { itemId }: { itemId: number } = $props()

let listings = $state<Listing[]>([])
let loading = $state(true)
let error = $state(false)
let selectedWorld = $state('all')
let hqOnly = $state(false)
```

With:
```ts
let { itemId, selectedWorld, hqOnly }: {
  itemId: number
  selectedWorld: string
  hqOnly: boolean
} = $props()

let listings = $state<Listing[]>([])
let loading = $state(true)
let error = $state(false)
```

2. Replace inline filter logic with the shared helper. Replace:
```ts
const filteredListings = $derived.by(() => {
  let result = listings
  if (selectedWorld !== 'all') {
    result = result.filter(l => l.worldName === selectedWorld)
  }
  if (hqOnly) {
    result = result.filter(l => l.hq)
  }
  return result
})
```

With:
```ts
import { applyMarketFilters } from '$lib/client/market-filters'

const filteredListings = $derived(applyMarketFilters(listings, selectedWorld, hqOnly))
```

3. Remove the `DC_WORLDS` import (no longer needed in this file).

4. Remove the filter controls from the template. Delete lines 45-57 (the `<div class="flex items-center gap-2 mb-3 shrink-0">` block containing the select and toggle).

- [x] **Step 2: Run existing unit tests to check nothing breaks**

Run: `bun run test`
Expected: All tests pass (the e2e filter tests will be updated in Task 5)

- [x] **Step 3: Commit**

```bash
git add src/lib/components/ListingsTable.svelte
git commit -m "refactor(ui): remove filter UI from ListingsTable, accept filter props

Ref: ENG-132"
```

---

### Task 3: Update `SaleHistoryTable` — accept filter props, apply filtering

**Files:**
- Modify: `src/lib/components/SaleHistoryTable.svelte`

- [x] **Step 1: Update the component**

In `src/lib/components/SaleHistoryTable.svelte`:

1. Add filter props and import the shared helper. Replace:
```ts
import type { Sale } from '$lib/shared/types'
import { formatNumber, formatRelativeTime } from '$lib/client/format'

let { sales, loading, error }: { sales: Sale[]; loading: boolean; error: boolean } = $props()
```

With:
```ts
import type { Sale } from '$lib/shared/types'
import { formatNumber, formatRelativeTime } from '$lib/client/format'
import { applyMarketFilters } from '$lib/client/market-filters'

let { sales, loading, error, selectedWorld, hqOnly }: {
  sales: Sale[]
  loading: boolean
  error: boolean
  selectedWorld: string
  hqOnly: boolean
} = $props()

const filteredSales = $derived(applyMarketFilters(sales, selectedWorld, hqOnly))
```

2. Replace `sales` references in the template with `filteredSales`. Change:
- `{:else if sales.length === 0}` → `{:else if filteredSales.length === 0}`
- `{#each sales as sale, i (i)}` → `{#each filteredSales as sale, i (i)}`

3. Update the empty-state message to distinguish between "no data" and "filtered to empty". Replace:
```svelte
{:else if sales.length === 0}
  <p class="text-sm text-base-content/50">No sale history found</p>
```

With:
```svelte
{:else if filteredSales.length === 0}
  <p class="text-sm text-base-content/50">
    {sales.length === 0 ? 'No sale history found' : 'No sales match the current filters'}
  </p>
```

- [x] **Step 2: Run tests**

Run: `bun run test`
Expected: All unit tests pass

- [x] **Step 3: Commit**

```bash
git add src/lib/components/SaleHistoryTable.svelte
git commit -m "feat(ui): add filter props to SaleHistoryTable

Ref: ENG-132"
```

---

### Task 4: Update `+page.svelte` — own filter state, render filter controls, pass props

**Files:**
- Modify: `src/routes/item/[id]/+page.svelte`

- [x] **Step 1: Update the page component**

In `src/routes/item/[id]/+page.svelte`:

1. Add imports and filter state. After the existing imports, add:
```ts
import { DC_WORLDS } from '$lib/shared/universalis'
import { applyMarketFilters } from '$lib/client/market-filters'
```

After `let salesError = $state(false)`, add:
```ts
let selectedWorld = $state('all')
let hqOnly = $state(false)

const filteredSales = $derived(applyMarketFilters(sales, selectedWorld, hqOnly))
```

2. Add filter controls between the tab bar and tab content. After the closing `</div>` of the tab bar (line 107) and before `{#if activeTab === 'market'}` (line 110), add:

```svelte
{#if activeTab === 'market'}
  <div class="flex items-center gap-2 mb-4 shrink-0">
    <select class="select select-sm" bind:value={selectedWorld}>
      <option value="all">All Worlds</option>
      {#each DC_WORLDS as world (world.id)}
        <option value={world.name}>{world.name}</option>
      {/each}
    </select>

    <label class="label cursor-pointer gap-1">
      <input type="checkbox" class="toggle toggle-sm" bind:checked={hqOnly} />
      <span class="text-sm">HQ only</span>
    </label>
  </div>
{/if}
```

Note: This means the existing `{#if activeTab === 'market'}` that wraps the three sections should be removed (since we now have one above for filters). Merge them into a single block:

```svelte
{#if activeTab === 'market'}
  <div class="flex items-center gap-2 mb-4 shrink-0">
    <!-- filter controls as above -->
  </div>

  <!-- Listings | History -->
  <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
    ...
  </div>

  <!-- Price Statistics -->
  <div class="card bg-base-200 mt-4 shrink-0">
    ...
  </div>
{:else if activeTab === 'crafting'}
  ...
{/if}
```

3. Pass filter props to `ListingsTable`:

Replace:
```svelte
<ListingsTable itemId={data.itemID} />
```

With:
```svelte
<ListingsTable itemId={data.itemID} {selectedWorld} {hqOnly} />
```

4. Pass filter props to `SaleHistoryTable`:

Replace:
```svelte
<SaleHistoryTable {sales} loading={salesLoading} error={salesError} />
```

With:
```svelte
<SaleHistoryTable {sales} loading={salesLoading} error={salesError} {selectedWorld} {hqOnly} />
```

5. Pass pre-filtered sales to `PriceStats`:

Replace:
```svelte
<PriceStats {sales} loading={salesLoading} error={salesError} />
```

With:
```svelte
<PriceStats sales={filteredSales} loading={salesLoading} error={salesError} />
```

- [x] **Step 2: Run unit tests**

Run: `bun run test`
Expected: All unit tests pass

- [x] **Step 3: Commit**

```bash
git add src/routes/item/[id]/+page.svelte
git commit -m "feat(ui): promote market filters to page level

Ref: ENG-132"
```

---

### Task 5: Update e2e tests for page-level filter controls

**Files:**
- Modify: `tests/e2e/item-detail.test.ts`

The filter controls have moved from inside the ListingsTable card to the page level (above all three sections). Existing filter tests that scope their selectors to the listings card need updating.

- [x] **Step 1: Update existing filter tests**

In `tests/e2e/item-detail.test.ts`:

1. Update "world filter narrows results" test (lines 165-173). The `select` is now at page level, not inside the listings card. Replace:
```ts
test('world filter narrows results', async ({ page }) => {
  const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
  const select = listingsCard.locator('select')
  await expect(select).toBeVisible()
  await select.selectOption('利維坦')
  const rows = listingsCard.locator('table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('td').first()).toContainText('利維坦')
})
```

With:
```ts
test('world filter narrows listings', async ({ page }) => {
  const select = page.locator('select')
  await expect(select).toBeVisible()
  await select.selectOption('利維坦')
  const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
  const rows = listingsCard.locator('table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('td').first()).toContainText('利維坦')
})
```

2. Update "HQ toggle filters to HQ only" test (lines 175-183). Replace:
```ts
test('HQ toggle filters to HQ only', async ({ page }) => {
  const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
  const toggle = listingsCard.locator('input[type="checkbox"]')
  await toggle.check()
  const rows = listingsCard.locator('table tbody tr')
  // Only 1 HQ listing in mock data
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('td').nth(4)).toContainText('★')
})
```

With:
```ts
test('HQ toggle filters to HQ only', async ({ page }) => {
  const toggle = page.locator('input[type="checkbox"]')
  await toggle.check()
  const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
  const rows = listingsCard.locator('table tbody tr')
  // Only 1 HQ listing in mock data
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('td').nth(4)).toContainText('★')
})
```

3. Update "shows empty message when filters match nothing" test (lines 185-192). The select and toggle are now page-level. Replace:
```ts
test('shows empty message when filters match nothing', async ({ page }) => {
  // Select a world with no HQ listings, then enable HQ filter
  const select = page.locator('select')
  await select.selectOption('鳳凰')
  const toggle = page.locator('input[type="checkbox"]')
  await toggle.check()
  await expect(page.locator('text=No listings match the current filters')).toBeVisible()
})
```

With:
```ts
test('shows empty message when filters match nothing', async ({ page }) => {
  // Select a world with no HQ listings, then enable HQ filter
  const select = page.locator('select')
  await select.selectOption('鳳凰')
  const toggle = page.locator('input[type="checkbox"]')
  await toggle.check()
  await expect(page.locator('text=No listings match the current filters')).toBeVisible()
  await expect(page.locator('text=No sales match the current filters')).toBeVisible()
})
```

- [x] **Step 2: Add new e2e tests for cross-section filtering**

Add these tests inside the existing `test.describe('Item detail page', ...)` block, after the existing filter tests:

```ts
test('world filter also narrows sale history', async ({ page }) => {
  const select = page.locator('select')
  await select.selectOption('利維坦')
  const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
  const rows = historyCard.locator('table tbody tr')
  // In HISTORY_RESPONSE, entries cycle through 3 worlds: indices 1,4,7 are 利維坦 (i % 3 === 1)
  await expect(rows).toHaveCount(3)
  for (const row of await rows.all()) {
    await expect(row.locator('td').first()).toContainText('利維坦')
  }
})

test('HQ filter also narrows sale history', async ({ page }) => {
  const toggle = page.locator('input[type="checkbox"]')
  await toggle.check()
  const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
  const rows = historyCard.locator('table tbody tr')
  // In HISTORY_RESPONSE, HQ is true for even indices: 0,2,4,6,8 → 5 HQ sales
  await expect(rows).toHaveCount(5)
  for (const row of await rows.all()) {
    await expect(row.locator('td').nth(4)).toContainText('★')
  }
})

test('world filter affects price statistics', async ({ page }) => {
  const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
  // With all worlds, min price is 150 (first entry: 150 + 0*30)
  await expect(statsCard.locator('text=Min Price')).toBeVisible()

  // Filter to a world with no sales data → should show "No data available"
  // 鳳凰 has entries at indices 2,5,8, but let's filter to a world that won't have
  // recent-enough sales for volume stats. Instead, just verify stats card updates.
  // Filter to 鳳凰: indices 2,5,8 → prices 210,300,390. Min = 210.
  const select = page.locator('select')
  await select.selectOption('鳳凰')
  await expect(statsCard.locator('text=210')).toBeVisible()
})
```

- [x] **Step 3: Run e2e tests**

Run: `bun run test:e2e tests/e2e/item-detail.test.ts`
Expected: All tests pass

- [x] **Step 4: Commit**

```bash
git add tests/e2e/item-detail.test.ts
git commit -m "test(e2e): update filter tests for page-level controls, add cross-section tests

Ref: ENG-132"
```

---

### Task 6: Visual verification

- [x] **Step 1: Start dev server with fixture data**

Run: `FIXTURE_DATA=true bun run dev`

- [x] **Step 2: Navigate to item detail page and verify**

Use Playwright to navigate to an item detail page (e.g., `/item/2394`). Verify:

1. Filter controls (world select + HQ toggle) appear above the three Market sections, not inside the listings card
2. Selecting a world filters all three sections (listings, sale history, price stats)
3. Toggling HQ filters all three sections
4. Resetting to "All Worlds" restores unfiltered data
5. Switching to Crafting tab hides the filter controls
6. Switching back to Market tab shows filter controls with state preserved
7. Check mobile viewport (375px wide) — filter controls wrap appropriately

- [x] **Step 3: Kill dev server**

Stop the dev server process started in Step 1.
