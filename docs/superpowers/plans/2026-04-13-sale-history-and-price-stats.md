# Sale History and Price Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Final review includes cross-model verification via codex-review-gate.

**Goal:** Display recent sale history and price statistics on the item detail page, using data from the Universalis History API across all 陸行鳥 DC worlds.

**Architecture:** Page-level fetch distributes `Sale[]` to two presentational components: `SaleHistoryTable` (scrollable table) and `PriceStats` (stat grid). A new `fetchItemSaleHistory` client function hits the Universalis History endpoint. Price stat computations are extracted to a pure module for testability.

**Tech Stack:** SvelteKit, Svelte 5 (runes), TypeScript, DaisyUI, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-04-13-sale-history-and-price-stats-design.md`

---

### Task 1: Add `Sale` type and `fetchItemSaleHistory` client function

**Files:**
- Modify: `src/lib/shared/types.ts` (add `Sale` type after `Listing`)
- Modify: `src/lib/client/universalis.ts` (add `fetchItemSaleHistory` function)
- Modify: `tests/client/universalis.test.ts` (add tests for new function)

- [x] **Step 1: Add the `Sale` type**

In `src/lib/shared/types.ts`, add after the `Listing` type:

```ts
export type Sale = {
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  timestamp: number       // unix ms (converted from API seconds at ingest)
  hq: boolean
  buyerName: string | null
}
```

- [x] **Step 2: Write failing tests for `fetchItemSaleHistory`**

In `tests/client/universalis.test.ts`, add a new `describe` block after the existing `fetchItemListings` tests. Import `fetchItemSaleHistory` alongside the existing import:

```ts
import { fetchItemListings, fetchItemSaleHistory } from '$lib/client/universalis'
```

Add the History API mock response and tests:

```ts
// Universalis History endpoint response shape
const HISTORY_RESPONSE = {
  entries: [
    { timestamp: 1700000300, pricePerUnit: 500, quantity: 10, worldID: 4030, worldName: '利維坦', hq: false, buyerName: 'Player One' },
    { timestamp: 1700000100, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: true, buyerName: null },
    { timestamp: 1700000200, pricePerUnit: 800, quantity: 1, worldID: 4031, worldName: '鳳凰', hq: false, buyerName: 'Player Two' },
  ],
}

describe('fetchItemSaleHistory', () => {
  test('fetches from Universalis History endpoint with entriesToReturn=200', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(HISTORY_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const sales = await fetchItemSaleHistory(2394)

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('/api/v2/history/')
    expect(url).toContain('%E9%99%B8%E8%A1%8C%E9%B3%A5') // DC_NAME '陸行鳥'
    expect(url).toContain('2394')
    expect(url).toContain('entriesToReturn=200')
    expect(sales).toHaveLength(3)
  })

  test('converts timestamp from seconds to milliseconds', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(HISTORY_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const sales = await fetchItemSaleHistory(2394)

    for (const sale of sales) {
      expect(sale.timestamp).toBeGreaterThan(1_000_000_000_000)
    }
  })

  test('returns sales sorted by timestamp descending (most recent first)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(HISTORY_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const sales = await fetchItemSaleHistory(2394)

    expect(sales[0]!.timestamp).toBe(1700000300 * 1000)
    expect(sales[1]!.timestamp).toBe(1700000200 * 1000)
    expect(sales[2]!.timestamp).toBe(1700000100 * 1000)
  })

  test('maps all Sale fields correctly', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(HISTORY_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const sales = await fetchItemSaleHistory(2394)
    const mostRecent = sales[0]

    expect(mostRecent).toEqual({
      pricePerUnit: 500,
      quantity: 10,
      worldID: 4030,
      worldName: '利維坦',
      timestamp: 1700000300 * 1000,
      hq: false,
      buyerName: 'Player One',
    })
  })

  test('handles null buyerName', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(HISTORY_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const sales = await fetchItemSaleHistory(2394)
    const nullBuyer = sales.find(s => s.worldName === '伊弗利特')

    expect(nullBuyer!.buyerName).toBeNull()
  })

  test('throws on network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error')
    }) as unknown as typeof fetch

    await expect(fetchItemSaleHistory(2394)).rejects.toThrow('Network error')
  })

  test('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('', { status: 500 }),
    ) as unknown as typeof fetch

    await expect(fetchItemSaleHistory(2394)).rejects.toThrow('HTTP 500')
  })

  test('returns empty array when entries field is missing', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch

    const sales = await fetchItemSaleHistory(2394)

    expect(sales).toEqual([])
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `bun run test -- tests/client/universalis.test.ts`
Expected: FAIL — `fetchItemSaleHistory` is not exported from `$lib/client/universalis`

- [x] **Step 4: Implement `fetchItemSaleHistory`**

In `src/lib/client/universalis.ts`, add the History API response type and the fetch function:

```ts
import type { Listing, Sale } from '$lib/shared/types'
```

```ts
type UniversalisHistoryEntry = {
  timestamp: number
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  hq: boolean
  buyerName: string | null
}

type UniversalisHistoryResponse = {
  entries?: UniversalisHistoryEntry[]
}

export async function fetchItemSaleHistory(itemId: number): Promise<Sale[]> {
  const url = `${BASE_URL}/history/${encodeURIComponent(DC_NAME)}/${itemId}?entriesToReturn=200`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching sale history for item ${itemId}`)
  }
  const data = (await res.json()) as UniversalisHistoryResponse
  const sales = (data.entries ?? []).map((e): Sale => ({
    pricePerUnit: e.pricePerUnit,
    quantity: e.quantity,
    worldID: e.worldID,
    worldName: e.worldName,
    timestamp: e.timestamp * 1000,
    hq: e.hq,
    buyerName: e.buyerName ?? null,
  }))
  sales.sort((a, b) => b.timestamp - a.timestamp)
  return sales
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `bun run test -- tests/client/universalis.test.ts`
Expected: All tests PASS (both existing `fetchItemListings` and new `fetchItemSaleHistory`)

- [x] **Step 6: Commit**

```bash
git add src/lib/shared/types.ts src/lib/client/universalis.ts tests/client/universalis.test.ts
git commit -m "feat(ui): add Sale type and fetchItemSaleHistory client function

Ref: ENG-62"
```

---

### Task 2: Extract shared formatting helpers

Both `ListingsTable` and the new `SaleHistoryTable` need `formatRelativeTime` and `formatNumber`. Extract them from `ListingsTable.svelte` into a shared module.

**Files:**
- Create: `src/lib/client/format.ts`
- Modify: `src/lib/components/ListingsTable.svelte` (remove inline helpers, import from format.ts)
- Create: `tests/client/format.test.ts`

- [x] **Step 1: Write failing tests for format helpers**

Create `tests/client/format.test.ts`:

```ts
import { test, expect, describe, vi, afterEach } from 'vitest'
import { formatNumber, formatRelativeTime } from '$lib/client/format'

describe('formatNumber', () => {
  test('formats number with locale separators', () => {
    // toLocaleString output varies by environment, just verify it returns a string
    const result = formatNumber(1234567)
    expect(typeof result).toBe('string')
    expect(result).toContain('1')
  })

  test('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows seconds for < 60s', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(100_000))
    expect(formatRelativeTime(70_000)).toBe('30s ago')
  })

  test('shows minutes for < 60m', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(3_700_000))
    expect(formatRelativeTime(100_000)).toBe('60m ago')
  })

  test('shows hours for < 24h', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(7_300_000))
    expect(formatRelativeTime(100_000)).toBe('2h ago')
  })

  test('shows days for >= 24h', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(180_000_000))
    expect(formatRelativeTime(100_000)).toBe('2d ago')
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/client/format.test.ts`
Expected: FAIL — module `$lib/client/format` does not exist

- [x] **Step 3: Create `src/lib/client/format.ts`**

```ts
export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function formatRelativeTime(unixMs: number): string {
  const seconds = Math.floor((Date.now() - unixMs) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/client/format.test.ts`
Expected: All PASS

- [x] **Step 5: Update `ListingsTable.svelte` to import from format module**

In `src/lib/components/ListingsTable.svelte`, replace the inline `formatNumber` and `formatRelativeTime` functions with imports:

Add to the `<script>` block:

```ts
import { formatNumber, formatRelativeTime } from '$lib/client/format'
```

Remove the two function definitions (`formatNumber` and `formatRelativeTime`) from the script block.

- [x] **Step 6: Run full test suite to verify no regressions**

Run: `bun run test`
Expected: All tests PASS

- [x] **Step 7: Commit**

```bash
git add src/lib/client/format.ts tests/client/format.test.ts src/lib/components/ListingsTable.svelte
git commit -m "refactor(ui): extract formatNumber and formatRelativeTime to shared module

Ref: ENG-62"
```

---

### Task 3: Price stats computation module

Extract stat computation into a pure TypeScript module for easy unit testing.

**Files:**
- Create: `src/lib/client/price-stats.ts`
- Create: `tests/client/price-stats.test.ts`

- [x] **Step 1: Write failing tests**

Create `tests/client/price-stats.test.ts`:

```ts
import { test, expect, describe, vi, afterEach } from 'vitest'
import { computePriceStats } from '$lib/client/price-stats'
import type { Sale } from '$lib/shared/types'

function makeSale(overrides: Partial<Sale> & { timestamp: number }): Sale {
  return {
    pricePerUnit: 100,
    quantity: 1,
    worldID: 4030,
    worldName: '利維坦',
    hq: false,
    buyerName: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('computePriceStats', () => {
  test('returns null for empty array', () => {
    expect(computePriceStats([])).toBeNull()
  })

  test('computes min price', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [
      makeSale({ pricePerUnit: 300, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 100, timestamp: 1700000200_000 }),
      makeSale({ pricePerUnit: 500, timestamp: 1700000100_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.minPrice).toBe(100)
  })

  test('computes median price with odd count', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [
      makeSale({ pricePerUnit: 300, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 100, timestamp: 1700000200_000 }),
      makeSale({ pricePerUnit: 500, timestamp: 1700000100_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.medianPrice).toBe(300)
  })

  test('computes median price with even count', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000500_000))
    const sales = [
      makeSale({ pricePerUnit: 100, timestamp: 1700000400_000 }),
      makeSale({ pricePerUnit: 200, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 300, timestamp: 1700000200_000 }),
      makeSale({ pricePerUnit: 400, timestamp: 1700000100_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.medianPrice).toBe(250)
  })

  test('computes revenue-weighted average', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    // 100 gil × 10 units = 1000 revenue
    // 200 gil × 5 units = 1000 revenue
    // weighted avg = 2000 / 15 ≈ 133.33
    const sales = [
      makeSale({ pricePerUnit: 100, quantity: 10, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 200, quantity: 5, timestamp: 1700000200_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.avgPrice).toBeCloseTo(133.33, 1)
  })

  test('computes 24h volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000 // reference time
    vi.setSystemTime(new Date(now))
    const sales = [
      makeSale({ quantity: 10, timestamp: now - 3600_000 }),         // 1h ago — within 24h
      makeSale({ quantity: 5, timestamp: now - 80000_000 }),          // ~22h ago — within 24h
      makeSale({ quantity: 20, timestamp: now - 90000_000 }),         // 25h ago — outside 24h
    ]
    const stats = computePriceStats(sales)!
    expect(stats.volume24h).toBe(15)
  })

  test('computes 7d volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const DAY = 86400_000
    const sales = [
      makeSale({ quantity: 10, timestamp: now - 1 * DAY }),    // 1d ago
      makeSale({ quantity: 5, timestamp: now - 3 * DAY }),     // 3d ago
      makeSale({ quantity: 20, timestamp: now - 8 * DAY }),    // 8d ago — outside 7d
    ]
    const stats = computePriceStats(sales)!
    expect(stats.volume7d).toBe(15)
  })

  test('splits HQ and NQ volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const sales = [
      makeSale({ quantity: 10, hq: true, timestamp: now - 3600_000 }),
      makeSale({ quantity: 5, hq: false, timestamp: now - 7200_000 }),
      makeSale({ quantity: 3, hq: true, timestamp: now - 10800_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.hqVolume24h).toBe(13)
    expect(stats.nqVolume24h).toBe(5)
    expect(stats.hqVolume7d).toBe(13)
    expect(stats.nqVolume7d).toBe(5)
  })

  test('single entry works', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [makeSale({ pricePerUnit: 500, quantity: 3, timestamp: 1700000300_000 })]
    const stats = computePriceStats(sales)!
    expect(stats.minPrice).toBe(500)
    expect(stats.medianPrice).toBe(500)
    expect(stats.avgPrice).toBe(500)
  })

  test('all HQ sales have zero NQ volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const sales = [
      makeSale({ quantity: 10, hq: true, timestamp: now - 3600_000 }),
      makeSale({ quantity: 5, hq: true, timestamp: now - 7200_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.nqVolume24h).toBe(0)
    expect(stats.nqVolume7d).toBe(0)
    expect(stats.hqVolume24h).toBe(15)
    expect(stats.hqVolume7d).toBe(15)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/client/price-stats.test.ts`
Expected: FAIL — module `$lib/client/price-stats` does not exist

- [x] **Step 3: Implement `computePriceStats`**

Create `src/lib/client/price-stats.ts`:

```ts
import type { Sale } from '$lib/shared/types'

export type PriceStatsResult = {
  minPrice: number
  medianPrice: number
  avgPrice: number
  volume24h: number
  volume7d: number
  hqVolume24h: number
  nqVolume24h: number
  hqVolume7d: number
  nqVolume7d: number
}

export function computePriceStats(sales: Sale[]): PriceStatsResult | null {
  if (sales.length === 0) return null

  const prices = sales.map(s => s.pricePerUnit).sort((a, b) => a - b)
  const minPrice = prices[0]!
  const mid = Math.floor(prices.length / 2)
  const medianPrice = prices.length % 2 === 1
    ? prices[mid]!
    : (prices[mid - 1]! + prices[mid]!) / 2

  const totalRevenue = sales.reduce((sum, s) => sum + s.pricePerUnit * s.quantity, 0)
  const totalQty = sales.reduce((sum, s) => sum + s.quantity, 0)
  const avgPrice = totalRevenue / totalQty

  const now = Date.now()
  const DAY = 86400_000
  const cutoff24h = now - DAY
  const cutoff7d = now - 7 * DAY

  let volume24h = 0, volume7d = 0
  let hqVolume24h = 0, nqVolume24h = 0
  let hqVolume7d = 0, nqVolume7d = 0

  for (const s of sales) {
    if (s.timestamp >= cutoff7d) {
      volume7d += s.quantity
      if (s.hq) hqVolume7d += s.quantity
      else nqVolume7d += s.quantity
    }
    if (s.timestamp >= cutoff24h) {
      volume24h += s.quantity
      if (s.hq) hqVolume24h += s.quantity
      else nqVolume24h += s.quantity
    }
  }

  return {
    minPrice, medianPrice, avgPrice,
    volume24h, volume7d,
    hqVolume24h, nqVolume24h,
    hqVolume7d, nqVolume7d,
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/client/price-stats.test.ts`
Expected: All PASS

- [x] **Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests PASS

- [x] **Step 6: Commit**

```bash
git add src/lib/client/price-stats.ts tests/client/price-stats.test.ts
git commit -m "feat(ui): add price stats computation module

Ref: ENG-62"
```

---

### Task 4: SaleHistoryTable component

**Files:**
- Create: `src/lib/components/SaleHistoryTable.svelte`

This is a Svelte component — use the `svelte-file-editor` subagent type. The component receives `Sale[]`, `loading`, and `error` as props and renders a scrollable table. No internal fetch, no filters.

- [x] **Step 1: Create `SaleHistoryTable.svelte`**

Create `src/lib/components/SaleHistoryTable.svelte`. Use the `svelte:svelte-file-editor` subagent to create this file, providing the full spec:

- Props: `sales: Sale[]`, `loading: boolean`, `error: boolean`
- Import `Sale` from `$lib/shared/types`, formatting helpers from `$lib/client/format`
- **Loading state**: skeleton rows (3 lines, matching `ListingsTable` pattern): `<div class="skeleton h-4 w-full"></div>` repeated
- **Error state**: `<p class="text-sm text-error">Unable to load sale history</p>`
- **Empty state** (not loading, not error, `sales.length === 0`): `<p class="text-sm text-base-content/50">No sale history found</p>`
- **Table** (populated state): wrapped in `<div data-testid="history-scroll-container" class="flex-1 overflow-auto min-h-0">`
  - Table classes: `table table-sm`
  - Columns: World, Price (text-right), Qty (text-right), Total (text-right), HQ, Buyer, Date
  - Price and Total formatted with `formatNumber`
  - Total = `sale.pricePerUnit * sale.quantity`
  - HQ: `sale.hq ? '★' : ''`
  - Buyer: `sale.buyerName ?? '—'`
  - Date: `formatRelativeTime(sale.timestamp)`

Reference `src/lib/components/ListingsTable.svelte` for exact markup style (DaisyUI table classes, text alignment, etc).

- [x] **Step 2: Verify the component compiles**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds (component is created but not yet used in a page — just checking for syntax errors)

- [x] **Step 3: Commit**

```bash
git add src/lib/components/SaleHistoryTable.svelte
git commit -m "feat(ui): add SaleHistoryTable presentational component

Ref: ENG-62"
```

---

### Task 5: PriceStats component

**Files:**
- Create: `src/lib/components/PriceStats.svelte`

- [x] **Step 1: Create `PriceStats.svelte`**

Create `src/lib/components/PriceStats.svelte`. Use the `svelte:svelte-file-editor` subagent.

- Props: `sales: Sale[]`, `loading: boolean`, `error: boolean`
- Import `Sale` from `$lib/shared/types`, `computePriceStats` from `$lib/client/price-stats`, `formatNumber` from `$lib/client/format`
- Derive stats: `const stats = $derived(computePriceStats(sales))`
- **Loading state**: skeleton blocks (3 `<div class="skeleton h-4 w-1/3"></div>`)
- **Error state**: `<p class="text-sm text-error">Unable to load price statistics</p>`
- **Empty state** (not loading, not error, `stats === null`): `<p class="text-sm text-base-content/50">No data available</p>`
- **Populated state**: A responsive stat grid using CSS grid. Use `grid grid-cols-2 sm:grid-cols-3 gap-4` layout. Each stat is a simple label/value pair:

```svelte
<div>
  <div class="text-xs text-base-content/50">Min Price</div>
  <div class="text-sm font-semibold">{formatNumber(stats.minPrice)}</div>
</div>
```

Stats to display:
  - Min Price: `stats.minPrice`
  - Median Price: `stats.medianPrice`
  - Avg Price: `Math.round(stats.avgPrice)` (rounded to whole gil)
  - Volume (24h): `stats.volume24h` with HQ/NQ breakdown: `{stats.hqVolume24h} HQ / {stats.nqVolume24h} NQ`
  - Volume (7d): `stats.volume7d` with HQ/NQ breakdown: `{stats.hqVolume7d} HQ / {stats.nqVolume7d} NQ`

- [x] **Step 2: Verify the component compiles**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds

- [x] **Step 3: Commit**

```bash
git add src/lib/components/PriceStats.svelte
git commit -m "feat(ui): add PriceStats presentational component

Ref: ENG-62"
```

---

### Task 6: Wire components into the item detail page

**Files:**
- Modify: `src/routes/item/[id]/+page.svelte`

- [x] **Step 1: Update the page to fetch history and render both components**

Modify `src/routes/item/[id]/+page.svelte`. Use the `svelte:svelte-file-editor` subagent.

Changes to the `<script>` block — add imports and state:

```ts
import { fetchItemSaleHistory } from '$lib/client/universalis'
import type { Sale } from '$lib/shared/types'
import SaleHistoryTable from '$lib/components/SaleHistoryTable.svelte'
import PriceStats from '$lib/components/PriceStats.svelte'
```

Add state variables:

```ts
let sales = $state<Sale[]>([])
let salesLoading = $state(true)
let salesError = $state(false)
```

Add fetch effect (after the existing `fetchItemMetadata` effect):

```ts
$effect(() => {
  salesLoading = true
  salesError = false
  fetchItemSaleHistory(data.itemID).then(result => {
    sales = result
    salesLoading = false
  }).catch(err => {
    console.warn('[universalis] Failed to fetch sale history:', err)
    salesError = true
    salesLoading = false
  })
})
```

Replace the Sale History skeleton card with:

```svelte
<div class="card bg-base-200 min-h-0 flex flex-col">
  <div class="card-body flex flex-col min-h-0">
    <h2 class="card-title shrink-0">Sale History</h2>
    <SaleHistoryTable {sales} loading={salesLoading} error={salesError} />
  </div>
</div>
```

Replace the Price Statistics skeleton card with:

```svelte
<div class="card bg-base-200 mt-4 shrink-0">
  <div class="card-body">
    <h2 class="card-title">Price Statistics</h2>
    <PriceStats {sales} loading={salesLoading} error={salesError} />
  </div>
</div>
```

- [x] **Step 2: Verify it builds**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds

- [x] **Step 3: Run full test suite**

Run: `bun run test`
Expected: All tests PASS

- [x] **Step 4: Commit**

```bash
git add src/routes/item/[id]/+page.svelte
git commit -m "feat(ui): wire SaleHistoryTable and PriceStats into item detail page

Ref: ENG-62"
```

---

### Task 7: E2e tests

**Files:**
- Modify: `tests/e2e/item-detail.test.ts`

- [x] **Step 1: Update the API mock to handle both Universalis endpoints**

The existing `mockApi` function uses a catch-all `**/universalis.app/api/v2/**` route. Now we need to differentiate between the CurrentlyShown endpoint (listings) and the History endpoint (sale history).

In `tests/e2e/item-detail.test.ts`, add the History mock response at the top (after the existing `UNIVERSALIS_RESPONSE`):

```ts
function makeSaleEntry(i: number) {
  const worlds = [
    { id: 4028, name: '伊弗利特' },
    { id: 4030, name: '利維坦' },
    { id: 4031, name: '鳳凰' },
  ]
  const world = worlds[i % worlds.length]!
  return {
    timestamp: Math.floor(Date.now() / 1000) - (i + 1) * 1800,
    pricePerUnit: 150 + i * 30,
    quantity: 1 + (i % 5),
    worldID: world.id,
    worldName: world.name,
    hq: i % 2 === 0,
    buyerName: i % 3 === 0 ? null : `Buyer ${i}`,
  }
}

const HISTORY_RESPONSE = {
  entries: Array.from({ length: 10 }, (_, i) => makeSaleEntry(i)),
}
```

Update the `mockApi` function to route the two Universalis endpoints separately. Replace the existing catch-all Universalis route:

```ts
// Mock Universalis History endpoint for sale history
await page.route('**/universalis.app/api/v2/history/**', route =>
  route.fulfill({ json: HISTORY_RESPONSE }),
)
// Mock Universalis CurrentlyShown endpoint for cross-world listings
await page.route('**/universalis.app/api/v2/**', route =>
  route.fulfill({ json: UNIVERSALIS_RESPONSE }),
)
```

**Important:** The History route must be registered **before** the catch-all route. Playwright matches routes in registration order — the first match wins.

- [x] **Step 2: Add sale history table tests**

Add a new `test.describe` block inside the existing outer describe:

```ts
test.describe('Sale history', () => {
  test('shows sale history table with data', async ({ page }) => {
    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    const table = historyCard.locator('table')
    await expect(table).toBeVisible()
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(10)
  })

  test('sale history table has correct columns', async ({ page }) => {
    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    const headers = historyCard.locator('table thead th')
    await expect(headers).toHaveCount(7)
    await expect(headers.nth(0)).toContainText('World')
    await expect(headers.nth(1)).toContainText('Price')
    await expect(headers.nth(2)).toContainText('Qty')
    await expect(headers.nth(3)).toContainText('Total')
    await expect(headers.nth(4)).toContainText('HQ')
    await expect(headers.nth(5)).toContainText('Buyer')
    await expect(headers.nth(6)).toContainText('Date')
  })

  test('shows buyer name or dash for null', async ({ page }) => {
    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    const rows = historyCard.locator('table tbody tr')
    // First entry (i=0) has buyerName: null → should show —
    const firstBuyer = rows.nth(0).locator('td').nth(5)
    await expect(firstBuyer).toContainText('—')
    // Second entry (i=1) has buyerName: 'Buyer 1'
    const secondBuyer = rows.nth(1).locator('td').nth(5)
    await expect(secondBuyer).toContainText('Buyer 1')
  })

  test('shows error when history fetch fails', async ({ page }) => {
    await page.route('**/universalis.app/api/v2/history/**', route =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    await expect(historyCard.locator('text=Unable to load sale history')).toBeVisible()
  })

  test('shows empty message when no history', async ({ page }) => {
    await page.route('**/universalis.app/api/v2/history/**', route =>
      route.fulfill({ json: { entries: [] } }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    await expect(historyCard.locator('text=No sale history found')).toBeVisible()
  })
})
```

- [x] **Step 3: Add price stats tests**

```ts
test.describe('Price statistics', () => {
  test('shows price stats with computed values', async ({ page }) => {
    const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
    await expect(statsCard.locator('text=Min Price')).toBeVisible()
    await expect(statsCard.locator('text=Median Price')).toBeVisible()
    await expect(statsCard.locator('text=Avg Price')).toBeVisible()
    await expect(statsCard.locator('text=Volume (24h)')).toBeVisible()
    await expect(statsCard.locator('text=Volume (7d)')).toBeVisible()
  })

  test('shows no data when history is empty', async ({ page }) => {
    await page.route('**/universalis.app/api/v2/history/**', route =>
      route.fulfill({ json: { entries: [] } }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
    await expect(statsCard.locator('text=No data available')).toBeVisible()
  })

  test('shows error when history fetch fails', async ({ page }) => {
    await page.route('**/universalis.app/api/v2/history/**', route =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
    await expect(statsCard.locator('text=Unable to load price statistics')).toBeVisible()
  })
})
```

- [x] **Step 4: Run e2e tests**

Run: `bunx playwright test tests/e2e/item-detail.test.ts`
Expected: All PASS

- [x] **Step 5: Run full test suite (unit + e2e)**

Run: `bun run test && bunx playwright test`
Expected: All PASS

- [x] **Step 6: Commit**

```bash
git add tests/e2e/item-detail.test.ts
git commit -m "test(e2e): add sale history and price stats e2e tests

Ref: ENG-62"
```

---

### Task 8: Visual verification and cleanup

- [x] **Step 1: Start dev server**

Run: `FIXTURE_DATA=true bun run dev -- --port 5174`

Note: Use port 5174 to avoid conflicting with any existing dev server. Track the PID to kill it later.

- [x] **Step 2: Visual verification via Playwright MCP**

Navigate to `http://localhost:5174/item/2394` (or any item ID that has fixture data) and take a screenshot. Verify:
- Sale History table renders in the right column with correct columns
- Price Statistics card renders below with stat values
- Layout is correct on desktop (two-column grid)
- Check mobile viewport (resize to 375px width) for responsive behavior

- [x] **Step 3: Kill dev server**

Kill the dev server process started in Step 1.

- [x] **Step 4: Final commit if any visual fixes were needed**

Only if visual verification revealed issues that needed fixing.
