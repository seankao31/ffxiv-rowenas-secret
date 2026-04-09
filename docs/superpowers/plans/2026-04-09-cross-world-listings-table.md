# Cross-World Listings Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Final review includes cross-model verification via codex-review-gate.

**Goal:** Display all current market board listings for an item across all DC worlds on the item detail page, with world and HQ filtering.

**Architecture:** Extract shared Universalis constants into `src/lib/shared/universalis.ts`. Add a client-side fetch module at `src/lib/client/universalis.ts`. Build a `ListingsTable.svelte` component that fetches, filters, and renders listings. Wire it into the existing item detail page.

**Tech Stack:** SvelteKit, Svelte 5 (runes), Tailwind CSS v4, DaisyUI v5, Universalis API v2, Vitest, Playwright

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/shared/universalis.ts` | DC constants: `DC_NAME`, `DC_WORLDS`, `HOME_WORLD_ID`, `BASE_URL` |
| Modify | `src/lib/server/universalis.ts` | Import constants from shared instead of inline definitions |
| Create | `src/lib/client/universalis.ts` | `fetchItemListings(itemId)` — client-side Universalis fetch |
| Create | `src/lib/components/ListingsTable.svelte` | Table component with world/HQ filters |
| Modify | `src/routes/item/[id]/+page.svelte:38-46` | Replace listings skeleton with `<ListingsTable>` |
| Create | `tests/client/universalis.test.ts` | Unit tests for client fetch module |
| Modify | `tests/e2e/item-detail.test.ts` | E2e tests for listings table |

---

### Task 1: Extract shared Universalis constants

**Files:**
- Create: `src/lib/shared/universalis.ts`
- Modify: `src/lib/server/universalis.ts:5-22`

- [ ] **Step 1: Create the shared constants module**

```typescript
// src/lib/shared/universalis.ts

export const DC_NAME = '陸行鳥'
export const BASE_URL = 'https://universalis.app/api/v2'
export const HOME_WORLD_ID = 4030

export const DC_WORLDS: { id: number; name: string }[] = [
  { id: 4028, name: '伊弗利特' },
  { id: 4029, name: '迦樓羅' },
  { id: 4030, name: '利維坦' },
  { id: 4031, name: '鳳凰' },
  { id: 4032, name: '奧汀' },
  { id: 4033, name: '巴哈姆特' },
  { id: 4034, name: '拉姆' },
  { id: 4035, name: '泰坦' },
]
```

- [ ] **Step 2: Update server module to import from shared**

In `src/lib/server/universalis.ts`, replace lines 1-22 with:

```typescript
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RateLimiter } from 'limiter'
import { DC_NAME, BASE_URL, HOME_WORLD_ID, DC_WORLDS } from '$lib/shared/universalis'

const HOME_WORLD = '利維坦'
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const USER_AGENT = process.env['UNIVERSALIS_USER_AGENT'] || 'FFXIV-Rowenas-Secret/1.0'
```

Also remove the standalone `export const HOME_WORLD_ID = 4030` on line 270 — it's now imported from shared. Update it to a re-export:

```typescript
export { HOME_WORLD_ID } from '$lib/shared/universalis'
```

And remove the standalone `export const DC_WORLDS` definition (lines 13-22) — it's now imported.

Keep exporting `DC_WORLDS` by adding a re-export so existing consumers aren't broken:

```typescript
export { DC_WORLDS, HOME_WORLD_ID } from '$lib/shared/universalis'
```

- [ ] **Step 3: Run all tests to verify no regressions**

Run: `bun run test`
Expected: All 151 tests pass — no behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/universalis.ts src/lib/server/universalis.ts
git commit -m "refactor(ENG-61): extract shared Universalis constants"
```

---

### Task 2: Client-side Universalis fetch module

**Files:**
- Create: `tests/client/universalis.test.ts`
- Create: `src/lib/client/universalis.ts`

- [ ] **Step 1: Write failing tests for the client module**

```typescript
// tests/client/universalis.test.ts
import { test, expect, describe, afterEach, vi } from 'vitest'
import { fetchItemListings } from '$lib/client/universalis'

const originalFetch = globalThis.fetch
const originalWarn = console.warn

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
})

// Universalis single-item DC response shape
const UNIVERSALIS_RESPONSE = {
  listings: [
    { lastReviewTime: 1700000300, pricePerUnit: 500, quantity: 10, worldID: 4030, worldName: '利維坦', hq: false },
    { lastReviewTime: 1700000200, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: true },
    { lastReviewTime: 1700000100, pricePerUnit: 800, quantity: 1, worldID: 4031, worldName: '鳳凰', hq: false },
  ],
}

describe('fetchItemListings', () => {
  test('fetches listings from Universalis DC endpoint and maps response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/v2/')
    expect(url).toContain('2394')
    expect(listings).toHaveLength(3)
  })

  test('converts lastReviewTime from seconds to milliseconds', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    for (const listing of listings) {
      expect(listing.lastReviewTime).toBeGreaterThan(1_000_000_000_000)
    }
  })

  test('returns listings sorted by pricePerUnit ascending', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(listings[0].pricePerUnit).toBe(200)
    expect(listings[1].pricePerUnit).toBe(500)
    expect(listings[2].pricePerUnit).toBe(800)
  })

  test('maps all Listing fields correctly', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)
    const cheapest = listings[0]

    expect(cheapest).toEqual({
      pricePerUnit: 200,
      quantity: 5,
      worldID: 4028,
      worldName: '伊弗利特',
      lastReviewTime: 1700000200 * 1000,
      hq: true,
    })
  })

  test('returns empty array on network error', async () => {
    console.warn = vi.fn() as typeof console.warn
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error')
    }) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(listings).toEqual([])
    expect(console.warn).toHaveBeenCalled()
  })

  test('returns empty array on HTTP error', async () => {
    console.warn = vi.fn() as typeof console.warn
    globalThis.fetch = vi.fn(async () =>
      new Response('', { status: 500 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(listings).toEqual([])
    expect(console.warn).toHaveBeenCalled()
  })

  test('returns empty array when listings field is missing', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(listings).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tests/client/universalis.test.ts`
Expected: FAIL — module `$lib/client/universalis` does not exist.

- [ ] **Step 3: Implement the client module**

```typescript
// src/lib/client/universalis.ts
import type { Listing } from '$lib/shared/types'
import { BASE_URL, DC_NAME } from '$lib/shared/universalis'

type UniversalisListing = {
  lastReviewTime: number
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  hq: boolean
}

type UniversalisResponse = {
  listings?: UniversalisListing[]
}

export async function fetchItemListings(itemId: number): Promise<Listing[]> {
  try {
    const url = `${BASE_URL}/${encodeURIComponent(DC_NAME)}/${itemId}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[universalis] HTTP ${res.status} fetching listings for item ${itemId}`)
      return []
    }
    const data = (await res.json()) as UniversalisResponse
    const listings = (data.listings ?? []).map((l): Listing => ({
      pricePerUnit: l.pricePerUnit,
      quantity: l.quantity,
      worldID: l.worldID,
      worldName: l.worldName,
      lastReviewTime: l.lastReviewTime * 1000,
      hq: l.hq,
    }))
    listings.sort((a, b) => a.pricePerUnit - b.pricePerUnit)
    return listings
  } catch (err) {
    console.warn('[universalis] Failed to fetch listings:', err)
    return []
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/client/universalis.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests pass (previous 151 + 7 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/client/universalis.ts tests/client/universalis.test.ts
git commit -m "feat(ENG-61): add client-side Universalis fetch module"
```

---

### Task 3: ListingsTable component

**Files:**
- Create: `src/lib/components/ListingsTable.svelte`

**Note:** This is a Svelte 5 component using runes (`$state`, `$derived`, `$effect`, `$props`). Use the `svelte-file-editor` subagent and svelte MCP tools for validation.

- [ ] **Step 1: Create the ListingsTable component**

```svelte
<!-- src/lib/components/ListingsTable.svelte -->
<script lang="ts">
  import type { Listing } from '$lib/shared/types'
  import { DC_WORLDS } from '$lib/shared/universalis'
  import { fetchItemListings } from '$lib/client/universalis'

  let { itemId }: { itemId: number } = $props()

  let listings = $state<Listing[]>([])
  let loading = $state(true)
  let error = $state(false)
  let selectedWorld = $state('all')
  let hqOnly = $state(false)

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

  $effect(() => {
    loading = true
    error = false
    fetchItemListings(itemId).then(result => {
      listings = result
      loading = false
    }).catch(() => {
      error = true
      loading = false
    })
  })

  function formatNumber(n: number): string {
    return n.toLocaleString()
  }

  function formatRelativeTime(unixMs: number): string {
    const seconds = Math.floor((Date.now() - unixMs) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }
</script>

<div class="flex items-center gap-2 mb-3">
  <select class="select select-sm" bind:value={selectedWorld}>
    <option value="all">All Worlds</option>
    {#each DC_WORLDS as world}
      <option value={world.name}>{world.name}</option>
    {/each}
  </select>

  <label class="label cursor-pointer gap-1">
    <input type="checkbox" class="toggle toggle-sm" bind:checked={hqOnly} />
    <span class="text-sm">HQ only</span>
  </label>
</div>

{#if loading}
  <div class="flex flex-col gap-2">
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-3/4"></div>
  </div>
{:else if error}
  <p class="text-sm text-error">Unable to load listings</p>
{:else if filteredListings.length === 0}
  <p class="text-sm text-base-content/50">
    {listings.length === 0 ? 'No listings found' : 'No listings match the current filters'}
  </p>
{:else}
  <div class="overflow-x-auto">
    <table class="table table-sm">
      <thead>
        <tr>
          <th>World</th>
          <th class="text-right">Price</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Total</th>
          <th>HQ</th>
          <th>Last Review</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredListings as listing}
          <tr>
            <td>{listing.worldName}</td>
            <td class="text-right">{formatNumber(listing.pricePerUnit)}</td>
            <td class="text-right">{listing.quantity}</td>
            <td class="text-right">{formatNumber(listing.pricePerUnit * listing.quantity)}</td>
            <td>{listing.hq ? '★' : ''}</td>
            <td>{formatRelativeTime(listing.lastReviewTime)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
```

- [ ] **Step 2: Verify no build errors**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds (the component isn't wired in yet, but imports should resolve).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ListingsTable.svelte
git commit -m "feat(ENG-61): add ListingsTable component with world/HQ filters"
```

---

### Task 4: Wire ListingsTable into item detail page

**Files:**
- Modify: `src/routes/item/[id]/+page.svelte:38-46`

- [ ] **Step 1: Replace the listings skeleton with the component**

In `src/routes/item/[id]/+page.svelte`, replace the Cross-World Listings card (lines 39-46):

```svelte
  <div class="card bg-base-200">
    <div class="card-body">
      <h2 class="card-title">Cross-World Listings</h2>
      <div class="skeleton h-4 w-full"></div>
      <div class="skeleton h-4 w-3/4"></div>
      <div class="skeleton h-4 w-5/6"></div>
    </div>
  </div>
```

With:

```svelte
  <div class="card bg-base-200">
    <div class="card-body">
      <h2 class="card-title">Cross-World Listings</h2>
      <ListingsTable itemId={data.itemID} />
    </div>
  </div>
```

And add the import at the top of the `<script>` block (after the xivapi import on line 2):

```typescript
  import ListingsTable from '$lib/components/ListingsTable.svelte'
```

- [ ] **Step 2: Verify the dev server renders the page**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/routes/item/[id]/+page.svelte
git commit -m "feat(ENG-61): wire ListingsTable into item detail page"
```

---

### Task 5: E2e tests for the listings table

**Files:**
- Modify: `tests/e2e/item-detail.test.ts`

- [ ] **Step 1: Add Universalis mock and listings table tests**

Add the Universalis mock data and route mock to the existing test file. Update the `mockApi` function to also mock the Universalis endpoint. Add new test cases.

At the top of the file, after the existing constants (line 5), add:

```typescript
const UNIVERSALIS_RESPONSE = {
  listings: [
    { lastReviewTime: Math.floor(Date.now() / 1000) - 3600, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: true },
    { lastReviewTime: Math.floor(Date.now() / 1000) - 7200, pricePerUnit: 500, quantity: 10, worldID: 4030, worldName: '利維坦', hq: false },
    { lastReviewTime: Math.floor(Date.now() / 1000) - 1800, pricePerUnit: 800, quantity: 1, worldID: 4031, worldName: '鳳凰', hq: false },
  ],
}
```

In the `mockApi` function, add after the existing XIVAPI asset mock (after line 32):

```typescript
  // Mock Universalis DC endpoint for cross-world listings
  await page.route('**/universalis.app/api/v2/**', route =>
    route.fulfill({ json: UNIVERSALIS_RESPONSE }),
  )
```

Add new test cases inside the existing `test.describe('Item detail page', ...)` block:

```typescript
  test('listings table shows data from Universalis', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible()
    // 3 listings in mock data
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(3)
  })

  test('listings table shows correct columns', async ({ page }) => {
    const headers = page.locator('table thead th')
    await expect(headers).toHaveCount(6)
    await expect(headers.nth(0)).toContainText('World')
    await expect(headers.nth(1)).toContainText('Price')
    await expect(headers.nth(2)).toContainText('Qty')
    await expect(headers.nth(3)).toContainText('Total')
    await expect(headers.nth(4)).toContainText('HQ')
    await expect(headers.nth(5)).toContainText('Last Review')
  })

  test('listings are sorted by price ascending', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(3)
    // First row should be cheapest (200)
    const firstRowPrice = rows.nth(0).locator('td').nth(1)
    await expect(firstRowPrice).toContainText('200')
    // Last row should be most expensive (800)
    const lastRowPrice = rows.nth(2).locator('td').nth(1)
    await expect(lastRowPrice).toContainText('800')
  })

  test('world filter narrows results', async ({ page }) => {
    const select = page.locator('select')
    await expect(select).toBeVisible()
    await select.selectOption('利維坦')
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('td').first()).toContainText('利維坦')
  })

  test('HQ toggle filters to HQ only', async ({ page }) => {
    const toggle = page.locator('input[type="checkbox"]')
    await toggle.check()
    const rows = page.locator('table tbody tr')
    // Only 1 HQ listing in mock data
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('td').nth(4)).toContainText('★')
  })

  test('shows empty message when filters match nothing', async ({ page }) => {
    // Select a world with no HQ listings, then enable HQ filter
    const select = page.locator('select')
    await select.selectOption('鳳凰')
    const toggle = page.locator('input[type="checkbox"]')
    await toggle.check()
    await expect(page.locator('text=No listings match the current filters')).toBeVisible()
  })
```

- [ ] **Step 2: Run e2e tests**

Run: `bunx playwright test tests/e2e/item-detail.test.ts`
Expected: All tests pass (existing + new).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/item-detail.test.ts
git commit -m "test(ENG-61): add e2e tests for cross-world listings table"
```

---

### Task 6: Verify and clean up

- [ ] **Step 1: Run full unit test suite**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 2: Run full e2e test suite**

Run: `bunx playwright test`
Expected: All tests pass.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Clean build, no warnings.

- [ ] **Step 4: Visual verification with Playwright MCP**

Navigate to an item detail page (e.g., `/item/2394`) and take a screenshot to verify the table renders correctly with real or mocked data.

- [ ] **Step 5: Final commit if any cleanup was needed**

Only if prior steps required fixes.
