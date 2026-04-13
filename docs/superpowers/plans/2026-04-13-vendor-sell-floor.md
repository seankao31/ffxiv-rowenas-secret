# Vendor Sell Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Final review includes cross-model verification via codex-review-gate.

**Goal:** Add NPC vendor sell price (`Item.PriceLow`) as an alternative sell destination in the arbitrage scanner, so players can spot risk-free "buy on MB, sell to NPC" opportunities.

**Architecture:** Two-pass scoring — the existing MB-sell loop runs first (unchanged except adding `sellDestination: 'mb'`), then a second pass evaluates vendor-sell opportunities for items with `PriceLow > 0`. The second pass considers all worlds (including home) as buy sources and uses `profitPerUnit × sourceConfidence` for scoring. Results merge into a single sorted list.

**Tech Stack:** SvelteKit, TypeScript, XIVAPI v2, Universalis API, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-04-13-vendor-sell-floor-design.md`

---

### Task 1: Add `sellDestination` to Opportunity type and vendor sell price cache

**Files:**
- Modify: `src/lib/shared/types.ts:53-87`
- Modify: `src/lib/server/cache.ts`
- Modify: `tests/e2e/fixtures/opportunities.ts`

- [ ] **Step 1: Add `sellDestination` field to Opportunity type**

In `src/lib/shared/types.ts`, add after line 86 (`fairShareVelocity: number`):

```typescript
  sellDestination: 'mb' | 'vendor'
```

- [ ] **Step 2: Add vendor sell price storage to cache**

In `src/lib/server/cache.ts`, add a new map and getter/setter (same pattern as `vendorPrices`):

```typescript
let vendorSellPrices = new Map<number, number>()  // itemID → NPC vendor sell price (PriceLow)

export function setVendorSellPrices(prices: Map<number, number>): void {
  vendorSellPrices = prices
}

export function getVendorSellPrices(): Map<number, number> {
  return vendorSellPrices
}
```

- [ ] **Step 3: Add `sellDestination: 'mb'` to existing scoring output**

In `src/lib/server/scoring.ts`, add `sellDestination: 'mb' as const,` to the `opp` object (around line 176).

- [ ] **Step 4: Add `sellDestination: 'mb'` to e2e fixture data**

In `tests/e2e/fixtures/opportunities.ts`, add `sellDestination: 'mb' as const,` to every existing fixture item (6 items).

- [ ] **Step 5: Run tests to verify nothing breaks**

Run: `bun run test`

Expected: All 208 tests pass. The type change is additive — existing code just needs the new field.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/types.ts src/lib/server/cache.ts src/lib/server/scoring.ts tests/e2e/fixtures/opportunities.ts
git commit -m "feat(server): add sellDestination to Opportunity type and vendor sell price cache

Ref: ENG-111"
```

---

### Task 2: Fetch vendor sell prices from XIVAPI

**Files:**
- Modify: `src/lib/server/vendors.ts`
- Modify: `tests/server/vendors.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/server/vendors.test.ts`:

```typescript
import { fetchVendorPrices, fetchVendorSellPrices } from '$lib/server/vendors'

describe('fetchVendorSellPrices', () => {
  test('fetches marketable items then PriceLow from Item sheet', async () => {
    suppressLogs()
    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/marketable')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([5057, 4718]),
        } as unknown as Response)
      }
      if (urlStr.includes('sheet/Item') && urlStr.includes('PriceLow')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            rows: [
              { row_id: 5057, fields: { PriceLow: 25 } },
              { row_id: 4718, fields: { PriceLow: 50 } },
            ],
          }),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }) as unknown as typeof fetch

    const prices = await fetchVendorSellPrices()
    expect(prices.size).toBe(2)
    expect(prices.get(5057)).toBe(25)
    expect(prices.get(4718)).toBe(50)
  })

  test('skips items with PriceLow of zero', async () => {
    suppressLogs()
    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/marketable')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([5057, 4718]),
        } as unknown as Response)
      }
      if (urlStr.includes('sheet/Item')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            rows: [
              { row_id: 5057, fields: { PriceLow: 25 } },
              { row_id: 4718, fields: { PriceLow: 0 } },
            ],
          }),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }) as unknown as typeof fetch

    const prices = await fetchVendorSellPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(25)
  })

  test('returns empty map when no marketable items', async () => {
    suppressLogs()
    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/marketable')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }) as unknown as typeof fetch

    const prices = await fetchVendorSellPrices()
    expect(prices.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tests/server/vendors.test.ts`

Expected: FAIL — `fetchVendorSellPrices` is not exported.

- [ ] **Step 3: Generalize `fetchItemPrices` to accept a field parameter**

In `src/lib/server/vendors.ts`:

Change the `ItemPriceRow` type to accept any field:

```typescript
type ItemPriceRow = {
  row_id: number
  fields: Record<string, number | undefined>
}
```

Change the `fetchItemPrices` signature and body:

```typescript
async function fetchItemPrices(itemIds: number[], field: string = 'PriceMid'): Promise<Map<number, number>> {
```

Update the fetch URL inside the function:

```typescript
const res = await fetch(`${XIVAPI_BASE}/sheet/Item?rows=${batch.join(',')}&fields=${field}`)
```

Update the field access:

```typescript
const price = row.fields[field]
```

- [ ] **Step 4: Add `fetchVendorSellPrices` function**

Add to `src/lib/server/vendors.ts`:

```typescript
import { chunk, fetchMarketableItems } from './universalis'
```

(Update the existing `import { chunk }` line to also import `fetchMarketableItems`.)

Add the new exported function:

```typescript
export async function fetchVendorSellPrices(): Promise<Map<number, number>> {
  console.log('[vendors] Fetching marketable items for vendor sell prices...')
  const marketableIds = await fetchMarketableItems()
  if (marketableIds.length === 0) {
    console.warn('[vendors] No marketable items found for vendor sell prices')
    return new Map()
  }
  console.log(`[vendors] Fetching PriceLow for ${marketableIds.length} marketable items...`)
  const prices = await fetchItemPrices(marketableIds, 'PriceLow')
  console.log(`[vendors] Loaded ${prices.size} vendor sell prices`)
  return prices
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test tests/server/vendors.test.ts`

Expected: All tests pass (existing + new).

- [ ] **Step 6: Run full test suite**

Run: `bun run test`

Expected: All tests pass. The `fetchItemPrices` refactor is internal; existing `fetchVendorPrices` calls it with default `'PriceMid'`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/vendors.ts tests/server/vendors.test.ts
git commit -m "feat(server): add fetchVendorSellPrices for Item.PriceLow

Ref: ENG-111"
```

---

### Task 3: Vendor-sell scoring

**Files:**
- Modify: `src/lib/server/scoring.ts`
- Modify: `tests/server/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/server/scoring.test.ts`:

```typescript
describe('vendor-sell scoring', () => {
  test('vendor-sell surfaces item with no home listings', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('vendor')
    expect(results[0]!.sellPrice).toBe(500)
    expect(results[0]!.buyPrice).toBe(210)    // 200 × 1.05
    expect(results[0]!.profitPerUnit).toBe(290) // 500 - 210
    expect(results[0]!.homeConfidence).toBe(1.0)
    expect(results[0]!.homeDataAgeHours).toBe(0)
    expect(results[0]!.activeCompetitorCount).toBe(0)
  })

  test('vendor-sell can use home world as buy source', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 10, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('vendor')
    expect(results[0]!.sourceWorldID).toBe(HOME)
    expect(results[0]!.sourceWorld).toBe('利維坦')
  })

  test('vendor-sell replaces MB-sell when it scores higher', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 100, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0.1,
    })
    const vendorSellPrices = new Map([[1, 300]])
    // MB-sell score is tiny (velocity 0.1, turnover penalty)
    // Vendor-sell: profit = 300 - 105 = 195, score ≈ 195
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('vendor')
    expect(results[0]!.sellPrice).toBe(300)
  })

  test('MB-sell wins when it scores higher than vendor-sell', () => {
    const data = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 10,
    })
    // Vendor sell barely profitable
    const vendorSellPrices = new Map([[1, 430]])
    // MB-sell: profit 530, high velocity → high score
    // Vendor-sell: profit = 430 - 420 = 10, score ≈ 10
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('mb')
  })

  test('vendor-sell has no sell-side tax', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    // profit = 500 (no tax) - 200 * 1.05 = 290
    expect(results[0]!.profitPerUnit).toBe(290)
  })

  test('vendor-sell excluded when no profitable source listing', () => {
    const data = item({
      listings: [
        { pricePerUnit: 600, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    // buy = 630 > sell = 500 → no profit
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(0)
  })

  test('item without vendor sell price uses MB-sell only', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, undefined, new Map())
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('mb')
  })

  test('vendor-sell score is profitPerUnit × sourceConfidence', () => {
    const data: ItemData = {
      itemID: 1,
      worldUploadTimes: { [SRC_B]: STALE20H },
      homeLastUploadTime: 0,
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: STALE20H, hq: false },
      ],
      regularSaleVelocity: 0,
      hqSaleVelocity: 0,
      recentHistory: [],
    }
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    // profit = 290, sourceConf = exp(-20/12) ≈ 0.189
    const expectedScore = 290 * Math.exp(-20 / 12)
    expect(results[0]!.score).toBeCloseTo(expectedScore, 0)
  })

  test('regular opportunity has sellDestination mb', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('mb')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tests/server/scoring.test.ts`

Expected: FAIL — `scoreOpportunities` doesn't accept a 5th parameter, and no vendor-sell evaluation exists.

- [ ] **Step 3: Implement vendor-sell scoring**

In `src/lib/server/scoring.ts`:

**3a.** Move the `WorldResult` type from inside the loop (line 86-96) to function scope (just after the `const opportunities` declaration on line 29).

**3b.** Add `vendorSellPrices` parameter to function signature:

```typescript
export function scoreOpportunities(
  cache: Map<number, ItemData>,
  nameMap: Map<number, string>,
  params: ThresholdParams,
  vendorPrices?: Map<number, number>,
  vendorSellPrices?: Map<number, number>,
): Opportunity[] {
```

**3c.** After the existing `for (const item of cache.values())` loop ends (before `opportunities.sort`), add the vendor-sell second pass:

```typescript
  // --- Vendor-sell pass ---
  // Evaluate selling to NPC vendor (PriceLow) as alternative to home-world MB.
  // All worlds (including home) are valid buy sources for vendor-sell.
  if (vendorSellPrices && vendorSellPrices.size > 0) {
    const mbByItem = new Map<number, number>()
    for (let i = 0; i < opportunities.length; i++) {
      mbByItem.set(opportunities[i]!.itemID, i)
    }

    for (const item of cache.values()) {
      const vendorSellPrice = vendorSellPrices.get(item.itemID)
      if (vendorSellPrice === undefined || vendorSellPrice <= 0) continue

      const allListings = params.hq ? item.listings.filter(l => l.hq) : item.listings
      const worldIds = [...new Set(allListings.map(l => l.worldID))]
      const worldResults: WorldResult[] = []

      for (const worldID of worldIds) {
        const wListings = allListings.filter(l => l.worldID === worldID)
        const minPrice = Math.min(...wListings.map(l => l.pricePerUnit))
        const activeSrc = wListings.filter(l =>
          l.pricePerUnit <= minPrice * params.price_threshold &&
          l.lastReviewTime >= stalenessCutoff
        )
        if (activeSrc.length === 0) continue

        const cheapestSource = Math.min(...activeSrc.map(l => l.pricePerUnit))
        const effectiveBuyPrice = cheapestSource * (1 + MARKET_TAX)
        const profitPerUnit = vendorSellPrice - effectiveBuyPrice
        if (profitPerUnit <= 0) continue

        const uploadTime = item.worldUploadTimes[worldID] ?? 0
        const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
        const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H)
        const worldScore = profitPerUnit * sourceConf

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
      }

      if (worldResults.length === 0) continue

      const best = worldResults.reduce((a, b) => b.worldScore > a.worldScore ? b : a)
      const altCandidates = worldResults.filter(w => w.worldID !== best.worldID)
      const alt = altCandidates.length > 0
        ? altCandidates.reduce((a, b) => b.profitPerUnit > a.profitPerUnit ? b : a)
        : null

      const velocity = params.hq ? item.hqSaleVelocity : item.regularSaleVelocity

      const opp: Opportunity = {
        itemID: item.itemID,
        itemName: nameMap.get(item.itemID) ?? `Item #${item.itemID}`,
        sellDestination: 'vendor',

        buyPrice: Math.round(best.effectiveBuyPrice),
        sellPrice: vendorSellPrice,
        listingPrice: vendorSellPrice,
        profitPerUnit: Math.round(best.profitPerUnit),
        listingProfitPerUnit: Math.round(best.profitPerUnit),

        sourceWorld: best.worldName,
        sourceWorldID: best.worldID,

        availableUnits: best.availableUnits,
        recommendedUnits: best.availableUnits,
        expectedDailyProfit: Math.round(best.profitPerUnit * velocity),

        score: best.worldScore,

        homeDataAgeHours: 0,
        homeConfidence: 1.0,

        sourceDataAgeHours: Math.round(best.sourceAgeHours * 10) / 10,
        sourceConfidence: Math.round(best.sourceConf * 1000) / 1000,

        activeCompetitorCount: 0,
        fairShareVelocity: Math.round(velocity * 100) / 100,
      }

      if (alt) {
        opp.altSourceWorld = alt.worldName
        opp.altSourceWorldID = alt.worldID
        opp.altBuyPrice = Math.round(alt.effectiveBuyPrice)
        opp.altExpectedDailyProfit = Math.round(alt.profitPerUnit * velocity)
        opp.altSourceConfidence = Math.round(alt.sourceConf * 1000) / 1000
        opp.altSourceDataAgeHours = Math.round(alt.sourceAgeHours * 10) / 10
      }

      const existingIdx = mbByItem.get(item.itemID)
      if (existingIdx !== undefined) {
        if (opp.score > opportunities[existingIdx]!.score) {
          opportunities[existingIdx] = opp
        }
      } else {
        opportunities.push(opp)
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/server/scoring.test.ts`

Expected: All tests pass (existing + new vendor-sell tests).

- [ ] **Step 5: Run full test suite**

Run: `bun run test`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/scoring.ts tests/server/scoring.test.ts
git commit -m "feat(server): add vendor-sell scoring pass for PriceLow arbitrage

Ref: ENG-111"
```

---

### Task 4: Wire vendor sell prices through API and startup

**Files:**
- Modify: `src/routes/api/opportunities/+server.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Update API route to pass vendor sell prices**

In `src/routes/api/opportunities/+server.ts`, add `getVendorSellPrices` to the import:

```typescript
import { getAllItems, getNameMap, getVendorPrices, getVendorSellPrices, isCacheReady, getScanMeta, setScanMeta, getScanProgress } from '$lib/server/cache'
```

Update the `scoreOpportunities` call (line 25):

```typescript
const opportunities = scoreOpportunities(getAllItems(), getNameMap(), params, getVendorPrices(), getVendorSellPrices())
```

- [ ] **Step 2: Wire vendor sell price loading at startup**

In `src/hooks.server.ts`, add imports:

```typescript
import { fetchVendorPrices, fetchVendorSellPrices } from '$lib/server/vendors'
import { setVendorPrices, setVendorSellPrices } from '$lib/server/cache'
```

Add the fetch call in `init()` (same pattern as `fetchVendorPrices` — fire-and-forget, non-blocking):

```typescript
  fetchVendorSellPrices()
    .then(prices => {
      if (prices.size > 0) setVendorSellPrices(prices)
    })
    .catch(err => {
      console.error('[server] Vendor sell price fetch failed:', err)
    })
```

- [ ] **Step 3: Run full test suite**

Run: `bun run test`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/opportunities/+server.ts src/hooks.server.ts
git commit -m "feat(server): wire vendor sell prices through API and startup

Ref: ENG-111"
```

---

### Task 5: UI — NPC badge in sell column

**Files:**
- Modify: `src/lib/components/OpportunityTable.svelte:187-198`

- [ ] **Step 1: Update sell column to show NPC badge for vendor-sell**

In `src/lib/components/OpportunityTable.svelte`, replace the sell column (lines 187-198):

```svelte
          <!-- Sell -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.sellPrice)}</span>
              {#if opp.sellDestination === 'vendor'}
                <span class="badge badge-sm badge-soft badge-info">NPC</span>
              {:else}
                <span class="text-xs whitespace-nowrap" style="color: {ageColor(opp.homeConfidence)}">{ageLabel(opp.homeDataAgeHours)}</span>
              {/if}
            </div>
            {#if opp.sellDestination !== 'vendor' && opp.listingPrice !== opp.sellPrice}
              <div class="flex items-baseline gap-2.5 mt-1">
                <span class="w-[70px] text-right flex-shrink-0 text-xs text-base-content/40">{fmt(opp.listingPrice)}</span>
              </div>
            {/if}
          </td>
```

- [ ] **Step 2: Run full test suite**

Run: `bun run test`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/OpportunityTable.svelte
git commit -m "feat(ui): show NPC badge in sell column for vendor-sell opportunities

Ref: ENG-111"
```

---

### Task 6: E2E tests for vendor-sell display

**Files:**
- Modify: `tests/e2e/opportunity-table.test.ts`

- [ ] **Step 1: Add vendor-sell e2e tests**

Add a new describe block in `tests/e2e/opportunity-table.test.ts`:

```typescript
test.describe('vendor-sell display', () => {
  test.beforeEach(async ({ page }) => {
    const vendorOpp = {
      itemID: 201, itemName: 'Vendor Item',
      buyPrice: 100, sellPrice: 200, listingPrice: 200,
      profitPerUnit: 100, listingProfitPerUnit: 100,
      sourceWorld: '利維坦', sourceWorldID: 4030,
      sellDestination: 'vendor',
      availableUnits: 20, recommendedUnits: 20,
      expectedDailyProfit: 0, score: 50,
      homeDataAgeHours: 0, homeConfidence: 1.0,
      sourceDataAgeHours: 0.5, sourceConfidence: 0.9,
      activeCompetitorCount: 0, fairShareVelocity: 0,
    }
    await page.route('**/api/opportunities**', route => route.fulfill({
      json: { opportunities: [vendorOpp], meta },
    }))
    await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
    await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
    await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('shows NPC badge in sell column', async ({ page }) => {
    const sellCol = page.locator('table tbody tr').first().locator('td').nth(3)
    await expect(sellCol.locator('.badge')).toContainText('NPC')
  })

  test('does not show age indicator in sell column', async ({ page }) => {
    const sellCol = page.locator('table tbody tr').first().locator('td').nth(3)
    await expect(sellCol).not.toContainText('ago')
  })

  test('shows vendor sell price', async ({ page }) => {
    const sellCol = page.locator('table tbody tr').first().locator('td').nth(3)
    await expect(sellCol).toContainText('200')
  })
})
```

- [ ] **Step 2: Run e2e tests**

Run: `bunx playwright test tests/e2e/opportunity-table.test.ts`

Expected: All tests pass (existing + new vendor-sell tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/opportunity-table.test.ts
git commit -m "test(e2e): add vendor-sell display tests

Ref: ENG-111"
```

---

### Task 7: Visual verification

- [ ] **Step 1: Start dev server with fixture data**

Run: `FIXTURE_DATA=true bun run dev`

- [ ] **Step 2: Verify the arbitrage table visually**

Use Playwright MCP to navigate to `/arbitrage` and take a screenshot. Verify:

- Existing rows look correct (sell column shows age indicators)
- If any vendor-sell opportunities appear, they show the NPC badge in the sell column

Note: fixture data may not include vendor sell prices (requires XIVAPI availability at startup). If no vendor-sell rows appear, verify the NPC badge rendering by temporarily modifying fixture data or checking the e2e test screenshots.

- [ ] **Step 3: Kill the dev server**

Track the PID and kill it explicitly.
