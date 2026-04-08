# NPC Vendor Price Arbitrage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NPC vendor prices as a competing buy source in the arbitrage scoring model, with an "NPC" label in the table and a vendor metadata popover.

**Architecture:** At server startup, paginate XIVAPI v2's `GilShopItem` sheet to build a `Map<itemId, vendorPrice>`. In scoring, NPC is a virtual "world" competing alongside cross-world market board sources — 0% buy tax, 100% confidence, unlimited supply. Frontend shows "NPC" badge in the buy-from column and a metadata popover with NPC names and zones.

**Tech Stack:** SvelteKit 5, Vitest, Playwright, XIVAPI v2 (server-side), Garland Tools (client-side, TBD)

**Spec:** `docs/superpowers/specs/2026-04-07-npc-vendor-arbitrage-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/server/vendors.ts` | XIVAPI GilShopItem pagination, builds `Map<itemId, vendorPrice>` |
| Create | `tests/server/vendors.test.ts` | Tests for vendor price fetching |
| Modify | `src/lib/server/cache.ts` | Store/retrieve vendor price map |
| Modify | `src/lib/server/scoring.ts` | NPC as virtual world in scoring, add `effectiveBuyPrice` to WorldResult |
| Modify | `tests/server/scoring.test.ts` | NPC scoring test scenarios |
| Modify | `src/hooks.server.ts` | Fetch vendor prices at startup |
| Modify | `src/routes/api/opportunities/+server.ts` | Pass vendor prices to scoring |
| Modify | `src/lib/components/OpportunityTable.svelte` | NPC badge, age label, units display, vendor popover |
| Create | `src/lib/client/vendors.ts` | Client-side vendor metadata fetcher (NPC names + zones) |
| Create | `tests/client/vendors.test.ts` | Tests for vendor metadata fetching |
| Modify | `tests/e2e/fixtures/opportunities.ts` | Add NPC-sourced fixture |
| Modify | `tests/e2e/opportunity-table.test.ts` | E2E tests for NPC display |

---

### Task 1: Vendor Price Fetcher + Cache

**Files:**
- Create: `src/lib/server/vendors.ts`
- Create: `tests/server/vendors.test.ts`
- Modify: `src/lib/server/cache.ts`

- [ ] **Step 1: Write tests for `fetchVendorPrices`**

```typescript
// tests/server/vendors.test.ts
import { test, expect, describe, afterEach, vi } from 'vitest'
import { fetchVendorPrices } from '$lib/server/vendors'

const originalFetch = globalThis.fetch
const originalWarn = console.warn
const originalLog = console.log

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
  console.log = originalLog
})

function mockFetch(responses: Array<{ ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  let callIndex = 0
  globalThis.fetch = vi.fn(() => {
    const response = responses[callIndex++]!
    return Promise.resolve(response as unknown as Response)
  }) as unknown as typeof fetch
}

function suppressLogs() {
  console.warn = vi.fn()
  console.log = vi.fn()
}

describe('fetchVendorPrices', () => {
  test('paginates GilShopItem sheet and fetches item prices', async () => {
    suppressLogs()
    mockFetch([
      // Page 1 of GilShopItem
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 4718 } } },
          ],
          next: '2.0',
        }),
      },
      // Page 2 of GilShopItem (last page)
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 2, fields: { Item: { row_id: 10976 } } },
          ],
        }),
      },
      // Item price batch
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 120 } },
            { row_id: 10976, fields: { PriceMid: 8925 } },
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(3)
    expect(prices.get(5057)).toBe(63)
    expect(prices.get(4718)).toBe(120)
    expect(prices.get(10976)).toBe(8925)
  })

  test('deduplicates item IDs across multiple GilShopItem rows', async () => {
    suppressLogs()
    mockFetch([
      // Same item appears in two shops
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 5057 } } },
            { row_id: 2, fields: { Item: { row_id: 4718 } } },
          ],
        }),
      },
      // Item price batch — only 2 unique items fetched
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 120 } },
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(2)
    // Item batch should contain only unique IDs
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const itemBatchUrl = calls[1]![0] as string
    expect(itemBatchUrl).toContain('rows=5057,4718')
    expect(itemBatchUrl).not.toMatch(/5057.*5057/) // no duplicates
  })

  test('skips rows with missing or zero item ID', async () => {
    suppressLogs()
    mockFetch([
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 0 } } },      // zero ID
            { row_id: 2, fields: {} },                              // missing Item
          ],
        }),
      },
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
  })

  test('skips items with zero or missing PriceMid', async () => {
    suppressLogs()
    mockFetch([
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 4718 } } },
          ],
        }),
      },
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 0 } },   // zero price
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
  })

  test('returns empty map when GilShopItem fetch fails', async () => {
    suppressLogs()
    mockFetch([
      { ok: false, status: 500, json: () => Promise.resolve({}) },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })

  test('returns empty map when item price fetch fails', async () => {
    suppressLogs()
    mockFetch([
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [{ row_id: 0, fields: { Item: { row_id: 5057 } } }],
        }),
      },
      { ok: false, status: 500, json: () => Promise.resolve({}) },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })

  test('returns empty map when GilShopItem has no rows', async () => {
    suppressLogs()
    mockFetch([
      { ok: true, json: () => Promise.resolve({ rows: [] }) },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/server/vendors.test.ts`
Expected: FAIL — `$lib/server/vendors` does not exist

- [ ] **Step 3: Implement `fetchVendorPrices`**

```typescript
// src/lib/server/vendors.ts
const XIVAPI_BASE = 'https://v2.xivapi.com/api'
const PAGE_SIZE = 500
const BATCH_SIZE = 500

type GilShopItemRow = {
  row_id: number
  fields: {
    Item?: { row_id: number }
  }
}

type SheetResponse = {
  rows: GilShopItemRow[]
  next?: string
}

type ItemPriceRow = {
  row_id: number
  fields: {
    PriceMid?: number
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchVendorItemIds(): Promise<Set<number>> {
  const itemIds = new Set<number>()
  let cursor: string | undefined

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      fields: 'Item',
    })
    if (cursor) params.set('after', cursor)

    const res = await fetch(`${XIVAPI_BASE}/sheet/GilShopItem?${params}`)
    if (!res.ok) {
      console.warn(`[vendors] GilShopItem fetch failed: HTTP ${res.status}`)
      break
    }

    const data = (await res.json()) as SheetResponse
    for (const row of data.rows) {
      const itemId = row.fields.Item?.row_id
      if (itemId && itemId > 0) itemIds.add(itemId)
    }

    if (!data.next) break
    cursor = data.next
  }

  return itemIds
}

async function fetchItemPrices(itemIds: number[]): Promise<Map<number, number>> {
  const prices = new Map<number, number>()
  const batches = chunk(itemIds, BATCH_SIZE)

  for (const batch of batches) {
    const res = await fetch(`${XIVAPI_BASE}/sheet/Item?rows=${batch.join(',')}&fields=PriceMid`)
    if (!res.ok) {
      console.warn(`[vendors] Item price fetch failed: HTTP ${res.status}`)
      continue
    }

    const data = (await res.json()) as { rows: ItemPriceRow[] }
    for (const row of data.rows) {
      const price = row.fields.PriceMid
      if (price && price > 0) {
        prices.set(row.row_id, price)
      }
    }
  }

  return prices
}

export async function fetchVendorPrices(): Promise<Map<number, number>> {
  console.log('[vendors] Fetching vendor item IDs from XIVAPI...')
  const vendorItemIds = await fetchVendorItemIds()
  if (vendorItemIds.size === 0) {
    console.warn('[vendors] No vendor items found')
    return new Map()
  }
  console.log(`[vendors] Found ${vendorItemIds.size} vendor items, fetching prices...`)

  const prices = await fetchItemPrices([...vendorItemIds])
  console.log(`[vendors] Loaded ${prices.size} vendor prices`)
  return prices
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/server/vendors.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Add vendor price map to cache**

```typescript
// src/lib/server/cache.ts — add after nameCache declaration:

let vendorPrices = new Map<number, number>()  // itemID → NPC vendor price

// Add these exports:
export function setVendorPrices(prices: Map<number, number>): void {
  vendorPrices = prices
}

export function getVendorPrices(): Map<number, number> {
  return vendorPrices
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/vendors.ts tests/server/vendors.test.ts src/lib/server/cache.ts
git commit -m "feat: add XIVAPI vendor price fetcher and cache storage (ENG-56)"
```

---

### Task 2: Scoring Integration

**Files:**
- Modify: `src/lib/server/scoring.ts`
- Modify: `tests/server/scoring.test.ts`

- [ ] **Step 1: Write NPC scoring tests**

Add a new `describe('NPC vendor pricing', ...)` block at the end of `tests/server/scoring.test.ts`:

```typescript
describe('NPC vendor pricing', () => {
  const vendorPrices = new Map([[1, 300]])

  test('NPC as primary source when cheaper than all cross-world sources', () => {
    const data = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 500, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    // NPC: profit = 1000*0.95 - 300 = 650 (no buy tax)
    // 奧汀: profit = 1000*0.95 - 500*1.05 = 425
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, vendorPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('NPC')
    expect(results[0]!.sourceWorldID).toBe(0)
    expect(results[0]!.buyPrice).toBe(300)
    expect(results[0]!.profitPerUnit).toBe(650)
    expect(results[0]!.sourceConfidence).toBe(1)
    expect(results[0]!.sourceDataAgeHours).toBe(0)
  })

  test('NPC as alt source when cross-world has higher score', () => {
    const data = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 200, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const expensiveVendor = new Map([[1, 800]])
    // 奧汀: profit = 1000*0.95 - 200*1.05 = 740
    // NPC: profit = 1000*0.95 - 800 = 150
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, expensiveVendor)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.altSourceWorld).toBe('NPC')
    expect(results[0]!.altBuyPrice).toBe(800)
  })

  test('NPC excluded when vendor price yields no profit', () => {
    const data = item({
      listings: [
        { pricePerUnit: 500, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const expensiveVendor = new Map([[1, 600]])
    // NPC: profit = 500*0.95 - 600 = -125 → excluded
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, expensiveVendor)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.altSourceWorld).toBeUndefined()
  })

  test('item not in vendor map behaves unchanged', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, new Map())
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.profitPerUnit).toBe(530)
  })

  test('undefined vendorPrices behaves unchanged', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.profitPerUnit).toBe(530)
  })

  test('NPC buy price has zero tax', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, vendorPrices)
    expect(results[0]!.sourceWorld).toBe('NPC')
    // buyPrice = vendorPrice (no * 1.05 tax)
    expect(results[0]!.buyPrice).toBe(300)
    // profitPerUnit = 1000*0.95 - 300 = 650 (no buy tax)
    expect(results[0]!.profitPerUnit).toBe(650)
  })

  test('NPC has unlimited available units (sentinel -1)', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, vendorPrices)
    expect(results[0]!.sourceWorld).toBe('NPC')
    expect(results[0]!.availableUnits).toBe(-1)
    // recommendedUnits not capped by availableUnits
    // fairShareVelocity = 10 / (1+1) = 5, maxUnits = ceil(5 * 3) = 15
    expect(results[0]!.recommendedUnits).toBe(15)
  })

  test('NPC as sole source when no cross-world listings exist', () => {
    const homeOnly = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, homeOnly]]), names, DEFAULT, vendorPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('NPC')
    expect(results[0]!.buyPrice).toBe(300)
    expect(results[0]!.altSourceWorld).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/server/scoring.test.ts`
Expected: New NPC tests FAIL (scoreOpportunities doesn't accept vendorPrices param yet). Existing tests still PASS.

- [ ] **Step 3: Implement NPC scoring in `scoring.ts`**

Three changes to `src/lib/server/scoring.ts`:

**3a.** Add `vendorPrices` parameter and `effectiveBuyPrice` to WorldResult:

Change the function signature (line 21):
```typescript
export function scoreOpportunities(
  cache: Map<number, ItemData>,
  nameMap: Map<number, string>,
  params: ThresholdParams,
  vendorPrices?: Map<number, number>,
): Opportunity[] {
```

Add `effectiveBuyPrice` to the WorldResult type (line 85-94):
```typescript
    type WorldResult = {
      worldID: number
      worldName: string
      cheapestSource: number
      effectiveBuyPrice: number
      profitPerUnit: number
      sourceAgeHours: number
      sourceConf: number
      worldScore: number
      availableUnits: number
    }
```

**3b.** In the per-world loop, set `effectiveBuyPrice` for MB sources and use it for `profitPerUnit`. Replace lines 109-132:

```typescript
      const cheapestSource = Math.min(...activeSrc.map(l => l.pricePerUnit))
      const effectiveBuyPrice = cheapestSource * (1 + MARKET_TAX)
      const profitPerUnit = realisticSellPrice * (1 - MARKET_TAX) - effectiveBuyPrice
      if (profitPerUnit <= 0) continue

      const uploadTime = item.worldUploadTimes[worldID] ?? 0
      const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
      const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H)
      const worldScore = profitPerUnit * fairShareVelocity * homeConf * sourceConf * turnoverDiscount

      const availableUnits = activeSrc
        .filter(l => l.pricePerUnit === cheapestSource)
        .reduce((sum, l) => sum + l.quantity, 0)

      worldResults.push({
        worldID,
        worldName: wListings[0]!.worldName,
        cheapestSource,
        effectiveBuyPrice,
        profitPerUnit,
        sourceAgeHours,
        sourceConf,
        worldScore,
        availableUnits,
      })
```

**3c.** After the per-world loop (after line 133), add NPC vendor source check:

```typescript
    // --- NPC vendor source ---
    const vendorPrice = vendorPrices?.get(item.itemID)
    if (vendorPrice !== undefined) {
      const npcProfit = realisticSellPrice * (1 - MARKET_TAX) - vendorPrice
      if (npcProfit > 0) {
        worldResults.push({
          worldID: 0,
          worldName: 'NPC',
          cheapestSource: vendorPrice,
          effectiveBuyPrice: vendorPrice,
          profitPerUnit: npcProfit,
          sourceAgeHours: 0,
          sourceConf: 1.0,
          worldScore: npcProfit * fairShareVelocity * homeConf * turnoverDiscount,
          availableUnits: Infinity,
        })
      }
    }
```

**3d.** Update opportunity construction to use `effectiveBuyPrice`. Replace lines 149-185:

```typescript
    const maxUnits = Math.ceil(fairShareVelocity * params.days_of_supply)
    const recommendedUnits = isFinite(best.availableUnits)
      ? Math.min(best.availableUnits, maxUnits)
      : maxUnits

    const opp: Opportunity = {
      itemID: item.itemID,
      itemName: nameMap.get(item.itemID) ?? `Item #${item.itemID}`,

      buyPrice: Math.round(best.effectiveBuyPrice),
      sellPrice: realisticSellPrice,
      listingPrice: cheapestHomePrice,
      profitPerUnit: Math.round(best.profitPerUnit),
      listingProfitPerUnit: Math.round(cheapestHomePrice * (1 - MARKET_TAX) - best.effectiveBuyPrice),

      sourceWorld: best.worldName,
      sourceWorldID: best.worldID,

      availableUnits: isFinite(best.availableUnits) ? best.availableUnits : -1,
      recommendedUnits,
      expectedDailyProfit: Math.round(best.profitPerUnit * fairShareVelocity),

      score: best.worldScore,

      homeDataAgeHours: Math.round(homeAgeHours * 10) / 10,
      homeConfidence: Math.round(homeConf * 1000) / 1000,

      sourceDataAgeHours: Math.round(best.sourceAgeHours * 10) / 10,
      sourceConfidence: Math.round(best.sourceConf * 1000) / 1000,

      activeCompetitorCount,
      fairShareVelocity: Math.round(fairShareVelocity * 100) / 100,
    }

    if (alt) {
      opp.altSourceWorld = alt.worldName
      opp.altSourceWorldID = alt.worldID
      opp.altBuyPrice = Math.round(alt.effectiveBuyPrice)
      opp.altExpectedDailyProfit = Math.round(alt.profitPerUnit * fairShareVelocity)
      opp.altSourceConfidence = Math.round(alt.sourceConf * 1000) / 1000
      opp.altSourceDataAgeHours = Math.round(alt.sourceAgeHours * 10) / 10
    }
```

- [ ] **Step 4: Run all scoring tests**

Run: `bun run test -- tests/server/scoring.test.ts`
Expected: ALL tests PASS (both existing and new NPC tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/scoring.ts tests/server/scoring.test.ts
git commit -m "feat: add NPC vendor as virtual world in arbitrage scoring (ENG-56)"
```

---

### Task 3: Server Startup + API Wiring

**Files:**
- Modify: `src/hooks.server.ts`
- Modify: `src/routes/api/opportunities/+server.ts`

- [ ] **Step 1: Wire vendor fetch into server startup**

Replace `src/hooks.server.ts`:

```typescript
import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices } from '$lib/server/vendors'
import { setVendorPrices } from '$lib/server/cache'

export async function init() {
  // Fetch vendor prices (non-blocking for scanner — graceful degradation if XIVAPI is down)
  fetchVendorPrices()
    .then(prices => {
      if (prices.size > 0) setVendorPrices(prices)
    })
    .catch(err => {
      console.warn('[server] Vendor price fetch failed:', err)
    })

  startScanner().catch(err => {
    console.error('[server] Scanner crashed:', err)
    process.exit(1)
  })
}
```

- [ ] **Step 2: Pass vendor prices to scoring in API handler**

In `src/routes/api/opportunities/+server.ts`, add the import and pass vendor prices:

Add to imports:
```typescript
import { getAllItems, getNameMap, getVendorPrices, isCacheReady, getScanMeta, setScanMeta, getScanProgress } from '$lib/server/cache'
```

Change the `scoreOpportunities` call (line 25):
```typescript
    const opportunities = scoreOpportunities(getAllItems(), getNameMap(), params, getVendorPrices())
```

- [ ] **Step 3: Run full test suite to verify nothing breaks**

Run: `bun run test`
Expected: ALL tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/hooks.server.ts src/routes/api/opportunities/+server.ts
git commit -m "feat: wire vendor price fetching into startup and API endpoint (ENG-56)"
```

---

### Task 4: Frontend NPC Display

**Files:**
- Modify: `src/lib/components/OpportunityTable.svelte`
- Modify: `tests/e2e/fixtures/opportunities.ts`
- Modify: `tests/e2e/opportunity-table.test.ts`

- [ ] **Step 1: Add NPC fixture to E2E fixtures**

In `tests/e2e/fixtures/opportunities.ts`, add one NPC-sourced opportunity to the array (before the closing `]`):

```typescript
  {
    itemID: 106, itemName: 'Zeta Potion',
    buyPrice: 200, sellPrice: 800, listingPrice: 800,
    profitPerUnit: 560, listingProfitPerUnit: 560,
    sourceWorld: 'NPC', sourceWorldID: 0,
    availableUnits: -1, recommendedUnits: 8,
    expectedDailyProfit: 1120, score: 45,
    homeDataAgeHours: 0.4, homeConfidence: 0.92,
    sourceDataAgeHours: 0, sourceConfidence: 1,
    activeCompetitorCount: 2, fairShareVelocity: 2.0,
  },
```

Update `meta.itemsWithOpportunities` to `6`.

**Important:** Adding this fixture changes the expected sort orders in the existing E2E sort tests. The new item (Zeta Potion) has: `score: 45`, `expectedDailyProfit: 1120`, `profitPerUnit: 560`, `activeCompetitorCount: 2`, `fairShareVelocity: 2.0`. Update the expected `names` arrays in the sort tests to include 'Zeta Potion' in the correct position for each sort column.

- [ ] **Step 2: Write E2E tests for NPC display**

Add to `tests/e2e/opportunity-table.test.ts` inside the existing `test.describe`:

```typescript
  test('NPC source displays badge instead of world name', async ({ page }) => {
    const npcRow = page.locator('table tbody tr').last() // Zeta Potion is lowest score
    const buyFrom = npcRow.locator('td').nth(1)
    await expect(buyFrom.locator('.badge')).toContainText('NPC')
  })

  test('NPC source shows "NPC" instead of age in buy column', async ({ page }) => {
    const npcRow = page.locator('table tbody tr').last()
    const buyCol = npcRow.locator('td').nth(2)
    await expect(buyCol).toContainText('NPC')
    // Should NOT show "0min ago"
    await expect(buyCol).not.toContainText('ago')
  })

  test('NPC source shows unlimited units', async ({ page }) => {
    const npcRow = page.locator('table tbody tr').last()
    const unitsCol = npcRow.locator('td').nth(5)
    await expect(unitsCol).toContainText('8 / ∞')
  })
```

- [ ] **Step 3: Update `DEFAULT_ORDER` and run E2E tests to verify new tests fail**

In `tests/e2e/opportunity-table.test.ts`, `DEFAULT_ORDER` is derived from the fixtures array, so it automatically picks up the new entry. No manual update needed since `DEFAULT_ORDER = opportunities.map(o => o.itemName)`.

Run: `bun run test:e2e`
Expected: New NPC-specific tests FAIL (OpportunityTable doesn't handle NPC yet). Existing tests may need fixture count adjustments (e.g., `toHaveCount(6)` instead of 5).

- [ ] **Step 4: Implement NPC display in OpportunityTable**

In `src/lib/components/OpportunityTable.svelte`:

**4a.** Add helper function after `ageLabel` (around line 28):

```typescript
  const isNPC = (world: string) => world === 'NPC'
```

**4b.** Replace the "Buy from" column (lines 103-108):

```svelte
          <!-- Buy from -->
          <td>
            <div>
              {#if isNPC(opp.sourceWorld)}
                <span class="badge badge-sm badge-soft badge-info">NPC</span>
              {:else}
                {opp.sourceWorld}
              {/if}
            </div>
            {#if opp.altSourceWorld}
              <div class="text-xs text-base-content/50 mt-1">
                {#if isNPC(opp.altSourceWorld)}
                  <span class="badge badge-xs badge-soft badge-info">NPC</span>
                {:else}
                  {opp.altSourceWorld}
                {/if}
              </div>
            {/if}
          </td>
```

**4c.** Replace the age label in the "Buy" column (line 114):

```svelte
              <span class="text-xs" style="color: {ageColor(opp.sourceConfidence)}">
                {#if isNPC(opp.sourceWorld)}NPC{:else}{ageLabel(opp.sourceDataAgeHours)}{/if}
              </span>
```

And for the alt source age label (lines 119-121):

```svelte
                {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
                  <span class="text-xs" style="color: {ageColor(opp.altSourceConfidence)}">
                    {#if isNPC(opp.altSourceWorld ?? '')}NPC{:else}{ageLabel(opp.altSourceDataAgeHours)}{/if}
                  </span>
                {/if}
```

**4d.** Replace the "Units" column (lines 148-150):

```svelte
          <!-- Units -->
          <td>
            {#if opp.availableUnits < 0}
              <div>{opp.recommendedUnits} / ∞</div>
            {:else}
              <div>{opp.recommendedUnits} / {opp.availableUnits}</div>
            {/if}
          </td>
```

- [ ] **Step 5: Run E2E tests**

Run: `bun run test:e2e`
Expected: ALL tests PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run test && bun run test:e2e`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/OpportunityTable.svelte tests/e2e/fixtures/opportunities.ts tests/e2e/opportunity-table.test.ts
git commit -m "feat: display NPC badge, age label, and unlimited units in table (ENG-56)"
```

---

### Task 5: Client-Side Vendor Metadata + Popover

**Files:**
- Create: `src/lib/client/vendors.ts`
- Create: `tests/client/vendors.test.ts`
- Modify: `src/lib/components/OpportunityTable.svelte`

This task begins with an API investigation step. The preferred approach is Garland Tools' per-item API (rich vendor data, only ~50 items to fetch). Fallback: proxy through a SvelteKit API route if CORS blocks direct access.

- [ ] **Step 1: Research — test Garland Tools API response format and CORS**

Test from browser console or via curl:
```bash
curl -s 'https://garlandtools.org/api/get.php?type=item&lang=en&version=3&id=5057' | jq '.item.vendors, .partials[0]'
```

Verify:
1. Response contains `item.vendors` (array of NPC IDs)
2. Response contains `partials` with NPC details (name, location, zone)
3. If testing from browser: CORS headers present (`Access-Control-Allow-Origin`)

If CORS is blocked: create a proxy endpoint at `src/routes/api/vendor-info/[itemId]/+server.ts` that fetches from Garland server-side and returns the vendor data. Adjust the client-side fetcher accordingly.

Document findings in a code comment at the top of `src/lib/client/vendors.ts`.

- [ ] **Step 2: Write tests for vendor metadata fetcher**

```typescript
// tests/client/vendors.test.ts
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest'
import { fetchVendorInfo, getVendorInfo, _clearCache } from '$lib/client/vendors'

const originalFetch = globalThis.fetch
const originalWarn = console.warn

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
})

beforeEach(() => {
  _clearCache()
})

// Adjust this mock response based on Step 1 findings.
// This assumes Garland Tools format with partials containing NPC details.
const GARLAND_RESPONSE = {
  item: {
    id: 5057,
    vendors: [1000217, 1000394],
  },
  partials: [
    { type: 'npc', id: '1000217', obj: { n: 'Merchant & Mender', l: 52, c: [15.0, 11.8], a: 2 } },
    { type: 'npc', id: '1000394', obj: { n: 'Junkmonger', l: 40, c: [9.8, 11.4], a: 2 } },
  ],
}

describe('fetchVendorInfo', () => {
  test('fetches and caches vendor info for an item', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(GARLAND_RESPONSE),
      }),
    ) as unknown as typeof fetch

    await fetchVendorInfo(5057)
    const info = getVendorInfo(5057)

    expect(info).toHaveLength(2)
    expect(info![0]!.npcName).toBe('Merchant & Mender')
    expect(info![1]!.npcName).toBe('Junkmonger')
  })

  test('returns undefined for uncached item', () => {
    expect(getVendorInfo(99999)).toBeUndefined()
  })

  test('skips already-cached items', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(GARLAND_RESPONSE),
      }),
    ) as unknown as typeof fetch

    await fetchVendorInfo(5057)
    await fetchVendorInfo(5057) // second call should skip

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  test('handles fetch failure gracefully', async () => {
    console.warn = vi.fn()
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as unknown as typeof fetch

    await fetchVendorInfo(5057)
    expect(getVendorInfo(5057)).toBeUndefined()
  })

  test('handles item with no vendors', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          item: { id: 9999, vendors: [] },
          partials: [],
        }),
      }),
    ) as unknown as typeof fetch

    await fetchVendorInfo(9999)
    expect(getVendorInfo(9999)).toEqual([])
  })
})
```

**Note:** The exact response parsing and type definitions in this test will need adjustment based on Step 1 findings. The tests above assume the Garland Tools response format — if using a different API or proxy, update the mock responses and assertions.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test -- tests/client/vendors.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 4: Implement vendor metadata fetcher**

```typescript
// src/lib/client/vendors.ts
// Fetches NPC vendor metadata (names + zones) from Garland Tools.
// Only called for items with sourceWorld === 'NPC' in the current opportunity list.
// See Step 1 research results for API details.

// TODO: Adjust GARLAND_BASE and response types based on Step 1 findings.
// If CORS is blocked, change to fetch from /api/vendor-info/:itemId proxy.
const GARLAND_BASE = 'https://garlandtools.org/api/get.php'

export type VendorInfo = {
  npcName: string
  zone: string
}

type GarlandPartial = {
  type: string
  id: string
  obj: { n: string; l: number; c?: [number, number]; a?: number }
}

type GarlandItemResponse = {
  item: { id: number; vendors?: number[] }
  partials?: GarlandPartial[]
}

// Garland uses numeric location IDs → zone name mapping.
// This is a subset covering common vendor zones. Full list derived from Garland source.
// TODO: Populate this map during Step 1 research by examining actual API responses.
const ZONE_NAMES: Record<number, string> = {}

const cache = new Map<number, VendorInfo[]>()

export function getVendorInfo(itemId: number): VendorInfo[] | undefined {
  return cache.get(itemId)
}

/** @internal — test-only cache reset */
export function _clearCache(): void {
  cache.clear()
}

export async function fetchVendorInfo(itemId: number): Promise<void> {
  if (cache.has(itemId)) return

  try {
    const res = await fetch(`${GARLAND_BASE}?type=item&lang=en&version=3&id=${itemId}`)
    if (!res.ok) {
      console.warn(`[vendors] Failed to fetch vendor info for item ${itemId}: HTTP ${res.status}`)
      return
    }

    const data = (await res.json()) as GarlandItemResponse
    const vendorIds = new Set((data.item.vendors ?? []).map(String))
    const vendors: VendorInfo[] = []

    for (const partial of data.partials ?? []) {
      if (partial.type === 'npc' && vendorIds.has(partial.id)) {
        vendors.push({
          npcName: partial.obj.n,
          zone: ZONE_NAMES[partial.obj.l] ?? `Zone ${partial.obj.l}`,
        })
      }
    }

    cache.set(itemId, vendors)
  } catch (err) {
    console.warn(`[vendors] Failed to fetch vendor info for item ${itemId}:`, err)
  }
}
```

**Important:** The implementation above is a starting point based on the expected Garland Tools format. Step 1 research may reveal a different response structure, CORS issues, or a better zone-name resolution strategy. Adjust accordingly.

- [ ] **Step 5: Run tests**

Run: `bun run test -- tests/client/vendors.test.ts`
Expected: ALL PASS (adjust mock data if API format differs from assumption)

- [ ] **Step 6: Add vendor popover to OpportunityTable**

In `src/lib/components/OpportunityTable.svelte`:

**6a.** Add imports and vendor metadata fetching:

```typescript
  import { fetchVendorInfo, getVendorInfo } from '$lib/client/vendors.ts'

  // Fetch vendor metadata for NPC-sourced opportunities
  $effect(() => {
    const npcItems = opportunities.filter(o => o.sourceWorld === 'NPC' || o.altSourceWorld === 'NPC')
    for (const opp of npcItems) {
      fetchVendorInfo(opp.itemID)
    }
  })
```

**6b.** Replace the NPC badge in the "Buy from" column with a dropdown popover:

```svelte
{#snippet npcBadge(itemID: number, size: 'sm' | 'xs')}
  {@const vendors = getVendorInfo(itemID)}
  {#if vendors && vendors.length > 0}
    <div class="dropdown dropdown-hover dropdown-end">
      <div tabindex="0" role="button" class="badge badge-{size} badge-soft badge-info cursor-help">NPC</div>
      <div tabindex="0" class="dropdown-content z-10 shadow-md bg-base-200 rounded-box p-2 w-56">
        {#each vendors as v}
          <div class="text-xs py-0.5">{v.npcName} — {v.zone}</div>
        {/each}
      </div>
    </div>
  {:else}
    <span class="badge badge-{size} badge-soft badge-info">NPC</span>
  {/if}
{/snippet}
```

Use it in the "Buy from" column:
```svelte
          <td>
            <div>
              {#if isNPC(opp.sourceWorld)}
                {@render npcBadge(opp.itemID, 'sm')}
              {:else}
                {opp.sourceWorld}
              {/if}
            </div>
            {#if opp.altSourceWorld}
              <div class="text-xs text-base-content/50 mt-1">
                {#if isNPC(opp.altSourceWorld)}
                  {@render npcBadge(opp.itemID, 'xs')}
                {:else}
                  {opp.altSourceWorld}
                {/if}
              </div>
            {/if}
          </td>
```

- [ ] **Step 7: Run full test suite**

Run: `bun run test && bun run test:e2e`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/client/vendors.ts tests/client/vendors.test.ts src/lib/components/OpportunityTable.svelte
git commit -m "feat: add vendor metadata popover with NPC names and zones (ENG-56)"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
bun run test && bun run test:e2e
```
Expected: ALL PASS

- [ ] **Step 2: Type check**

```bash
bun run typecheck
```
Expected: No errors

- [ ] **Step 3: Manual smoke test**

Start the dev server and verify:
1. App starts without errors
2. Vendor prices load (check server logs for `[vendors] Loaded N vendor prices`)
3. NPC-sourced opportunities appear in the table with "NPC" badge
4. NPC badge shows green confidence indicator
5. Units column shows `N / ∞` for NPC sources
6. Hovering NPC badge shows vendor popover (if metadata loaded)

```bash
bun run dev
```

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -p  # review changes
git commit -m "feat: complete NPC vendor price arbitrage feature (ENG-56)"
```
