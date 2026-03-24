# Per-World Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DC-level Universalis endpoint with per-world fetches to reduce payload size and improve scan throughput.

**Architecture:** Phase 1 currently fetches `/v2/{dcName}/{ids}` which returns all 8 worlds' listings in one large response. We'll replace this with sequential per-world fetches using `/v2/{worldName}/{ids}`, processing one world at a time (all batches concurrent within a world). Phase 2 (home-world velocity/history) stays unchanged. The existing `fetchDCListings` is preserved alongside the new `fetchWorldListings` so we can A/B benchmark both approaches before committing to one.

**Tech Stack:** TypeScript, Bun runtime, Universalis REST API v2

---

## Background & Motivation

### Benchmark results (2026-03-24)

**Current DC-endpoint approach** (extrapolated from 500-item benchmark):

| Phase | Time (500 items) | Batch/s | Extrapolated full (~16,700 items, 168 batches) |
|-------|------------------|---------|-------------------------------------------------|
| Phase 1 (DC) | 10.5s | 0.5 | ~336s (~5.6 min) |
| Phase 2 (Home) | 1.8s | 2.7 | ~62s (~1 min) |
| **Total** | | | **~400s (~6.7 min)** |

**Teamcraft per-world approach** (user's live test on 陸行鳥 DC, 8 worlds):

| World | Time |
|-------|------|
| 伊弗利特 | 92s |
| 迦樓羅 | 77s |
| 利維坦 | 73s |
| 鳳凰 | 73s |
| 奧汀 | 70s |
| 巴哈姆特 | 74s |
| 拉姆 | 46s |
| 泰坦 | 56s |
| **Total** | **~561s (~9.4 min)** |

Teamcraft uses 5 concurrent / 8 req/s — more conservative than our 8 concurrent / 20 req/s. With our rate limits, per-world should be significantly faster than Teamcraft's numbers.

**Why per-world may be faster despite more requests:**
- DC endpoint returns listings for all 8 worlds → large JSON payloads (~2s per batch)
- Per-world endpoint returns 1 world → small payloads (~0.4s per batch, matching Phase 2 speed)
- Even with 8× more requests (168 × 8 = 1,344), at 20 req/s → theoretical minimum ~67s
- Actual will be higher due to response time, but likely 2-4× faster than DC endpoint

### Actual benchmark results (2026-03-24, post-implementation)

**DC strategy (500 items, 5 batches):**

| Phase | Time | Rate |
|-------|------|------|
| Phase 1 (DC) | 21.4s | 0.2 batch/s, 23 items/s |
| Phase 2 (Home) | 3.2s | 1.6 batch/s, 157 items/s |
| **Total** | **25.6s** | **19 items/s** |

**Per-world strategy (500 items, 5 batches × 8 worlds):**

| World | Time | Items | Listings |
|-------|------|-------|----------|
| 伊弗利特 | 2.8s | 500 | 1,856 |
| 迦樓羅 | 2.3s | 500 | 1,784 |
| 利維坦 | 2.2s | 500 | 1,795 |
| 鳳凰 | 2.3s | 500 | 1,647 |
| 奧汀 | 1.8s | 500 | 1,675 |
| 巴哈姆特 | 2.0s | 500 | 1,684 |
| 拉姆 | 0.4s | 500 | 0 |
| 泰坦 | 1.5s | 500 | 415 |
| **Phase 1 total** | **15.4s** | | **10,856** |

| Phase | Time | Rate |
|-------|------|------|
| Phase 1 (per-world) | 15.4s | 1.8–2.8 batch/s per world |
| Phase 2 (Home) | 2.2s | 2.3 batch/s, 232 items/s |
| **Total** | **19.0s** | **26 items/s** |

**Result: Per-world is ~28% faster on Phase 1 (15.4s vs 21.4s) and ~26% faster overall (19.0s vs 25.6s).** Default set to `per-world`.

### DC worlds (陸行鳥, 繁中服 region)

| ID | Name | Notes |
|----|------|-------|
| 4028 | 伊弗利特 | |
| 4029 | 迦樓羅 | |
| 4030 | 利維坦 | HOME WORLD |
| 4031 | 鳳凰 | |
| 4032 | 奧汀 | |
| 4033 | 巴哈姆特 | |
| 4034 | 拉姆 | |
| 4035 | 泰坦 | |

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/server/universalis.ts` | Modify | Add `fetchWorldListings()` — per-world batch fetch with progress callback. Keep existing `fetchDCListings()` intact. Add `DC_WORLDS` constant. |
| `src/server/scanner.ts` | Modify | Add `runScanCyclePerWorld()` alongside existing `runScanCycle()`. New function processes worlds sequentially, merges results into same `ItemData` shape. Add `SCAN_STRATEGY` toggle. |
| `tests/server/universalis.test.ts` | Modify | Add tests for `fetchWorldListings()` — same pattern as existing `fetchDCListings` tests. |
| `scripts/benchmark-scan.ts` | Modify | Add `--strategy dc|per-world` flag. Benchmark both approaches for comparison. |
| `docs/decisions/ADR-005-scan-rate-limiting.md` | Modify (later) | Update after benchmarks confirm which strategy wins. Not part of this plan. |

**Not changed:** `types.ts`, `cache.ts`, `scoring.ts`, `api.ts`, client code. The `ItemData` shape remains identical — the scanner produces the same output regardless of scan strategy.

---

## Task 1: Add `fetchWorldListings()` to universalis.ts

**Files:**
- Modify: `src/server/universalis.ts`
- Test: `tests/server/universalis.test.ts`

### Context

The new function fetches listings for a single world using `/v2/{worldName}/{ids}`. The response shape from Universalis for a single-world query is identical to the DC query but without the cross-world aggregation — each item's `listings` array only contains listings from that one world, and `worldUploadTimes` is absent (single world = `lastUploadTime` is the upload time).

The caller (scanner) will call this once per world, sequentially, and merge results.

### Return type

`fetchWorldListings` returns the same `DCBatchResult[]` shape so the scanner can merge per-world results identically to how it processes DC results today. The `worldUploadTimes` field is populated from each item's `lastUploadTime` keyed by the worldID.

- [ ] **Step 1: Add `DC_WORLDS` constant and `WorldBatchResult` type alias**

In `src/server/universalis.ts`, add below the existing constants (after line 7):

```typescript
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

No new type needed — we reuse `DCBatchResult`.

- [ ] **Step 2: Write the failing test for `fetchWorldListings`**

In `tests/server/universalis.test.ts`, add a new describe block. The test mocks fetch to return a single-world response (no `worldUploadTimes` field, listings only have one world):

```typescript
// Helper: build a minimal single-world batch response (no worldID/worldName —
// the single-world API omits them; fetchWorldListings injects them)
function worldResponse(items: Record<number, Record<string, unknown>>) {
  const ids = Object.keys(items).map(Number)
  const entries: Record<string, unknown> = {}
  for (const [id, extra] of Object.entries(items)) {
    entries[id] = {
      itemID: Number(id),
      lastUploadTime: 1_774_271_896_711,
      listings: [],
      recentHistory: [],
      ...extra,
    }
  }
  return JSON.stringify({ itemIDs: ids, items: entries, unresolvedItems: [] })
}

describe('fetchWorldListings', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns listings with worldID and worldName injected', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: {
          listings: [{
            lastReviewTime: 1_774_271_895,
            pricePerUnit: 500, quantity: 3,
            hq: false,
          }],
        },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4028, name: '伊弗利特' },
      [2],
    )

    expect(result.length).toBe(1)
    expect(result[0].itemID).toBe(2)
    expect(result[0].listings[0].worldID).toBe(4028)
    expect(result[0].listings[0].worldName).toBe('伊弗利特')
    expect(result[0].listings[0].lastReviewTime).toBe(1_774_271_895 * 1000)
  })

  test('populates worldUploadTimes from item lastUploadTime', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({ 2: {} }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4028, name: '伊弗利特' },
      [2],
    )

    expect(result[0].worldUploadTimes).toEqual({ 4028: 1_774_271_896_711 })
  })

  test('handles multi-item batch with correct per-item results', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: { listings: [{ lastReviewTime: 100, pricePerUnit: 10, quantity: 1, hq: false }] },
        3: { listings: [{ lastReviewTime: 200, pricePerUnit: 20, quantity: 5, hq: true }] },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4034, name: '拉姆' },
      [2, 3],
    )

    expect(result.length).toBe(2)
    const item2 = result.find(r => r.itemID === 2)!
    const item3 = result.find(r => r.itemID === 3)!
    expect(item2.listings[0].worldID).toBe(4034)
    expect(item2.listings[0].worldName).toBe('拉姆')
    expect(item3.listings[0].worldID).toBe(4034)
    expect(item3.listings[0].hq).toBe(true)
  })

  test('returns empty array when API returns HTTP error', async () => {
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4028, name: '伊弗利特' },
      [2],
    )

    expect(result).toEqual([])
  })
})
```

Update the import at the top of the test file to include `fetchWorldListings`:

```typescript
import { RateLimiter, Semaphore, fetchMarketableItems, fetchDCListings, fetchWorldListings, fetchItemName } from '../../src/server/universalis.ts'
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/server/universalis.test.ts`
Expected: FAIL — `fetchWorldListings` is not exported / does not exist.

- [ ] **Step 4: Implement `fetchWorldListings`**

Add to `src/server/universalis.ts` after the `fetchDCListings` function:

```typescript
export async function fetchWorldListings(
  world: { id: number; name: string },
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<DCBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(world.name)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          lastUploadTime: number
          listings: Array<{
            lastReviewTime: number
            pricePerUnit: number
            quantity: number
            hq: boolean
          }>
        }>
      } | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        worldUploadTimes: { [world.id]: item.lastUploadTime ?? 0 },
        listings: (item.listings ?? []).map(l => ({
          lastReviewTime: l.lastReviewTime * 1000,
          pricePerUnit: l.pricePerUnit,
          quantity: l.quantity,
          worldID: world.id,
          worldName: world.name,
          hq: l.hq,
        })),
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}
```

Key differences from `fetchDCListings`:
- Single-world endpoint URL (`/{worldName}/{ids}` instead of `/{dcName}/{ids}`)
- Injects `worldID` and `worldName` into each listing (API doesn't include them for single-world queries)
- Builds `worldUploadTimes` from item's `lastUploadTime` keyed by the world ID

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/server/universalis.test.ts`
Expected: All tests PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/server/universalis.ts tests/server/universalis.test.ts
git commit -m "feat: add fetchWorldListings for per-world scan strategy"
```

---

## Task 2: Add `runScanCyclePerWorld()` to scanner.ts

**Files:**
- Modify: `src/server/scanner.ts`

### Context

The new scan cycle function processes worlds sequentially. For each world, it fetches all item batches concurrently (same as today within a phase), then merges that world's results into a running `Map<itemID, { listings, worldUploadTimes }>`. After all worlds complete, it fetches home data (Phase 2, unchanged) and calls `buildItemData` + `setItem` as before.

A `SCAN_STRATEGY` constant controls which cycle function runs. This allows easy switching for benchmarking.

- [ ] **Step 1: Add imports and strategy toggle**

At the top of `src/server/scanner.ts`, update the import to include the new function and the world list:

```typescript
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchWorldListings, fetchItemName, DC_WORLDS } from './universalis.ts'
```

Add the strategy toggle below the existing constants:

```typescript
type ScanStrategy = 'dc' | 'per-world'
const SCAN_STRATEGY: ScanStrategy = (process.env['SCAN_STRATEGY'] as ScanStrategy) || 'per-world'
```

- [ ] **Step 2: Implement `runScanCyclePerWorld`**

Add the new function after `runScanCycle`:

```typescript
async function runScanCyclePerWorld(itemIds: number[]): Promise<void> {
  const cycleStart = Date.now()
  console.log(`[scanner] Starting per-world scan of ${itemIds.length} items across ${DC_WORLDS.length} worlds`)

  // Phase 1: fetch each world sequentially, merge results
  const mergedListings = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()

  for (const world of DC_WORLDS) {
    const worldStart = Date.now()
    console.log(`[scanner] Phase 1: ${world.name} (${world.id})...`)

    const worldResults = await fetchWorldListings(
      world,
      itemIds,
      makeProgressLogger(`Phase 1 [${world.name}]`),
    )

    for (const r of worldResults) {
      const existing = mergedListings.get(r.itemID)
      if (existing) {
        existing.listings.push(...(r.listings as Listing[]))
        Object.assign(existing.worldUploadTimes, r.worldUploadTimes)
      } else {
        mergedListings.set(r.itemID, {
          listings: r.listings as Listing[],
          worldUploadTimes: { ...r.worldUploadTimes },
        })
      }
    }

    const worldElapsed = ((Date.now() - worldStart) / 1000).toFixed(1)
    console.log(`[scanner] ${world.name} done: ${worldResults.length} items in ${worldElapsed}s`)
  }

  const p1Elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1)
  console.log(`[scanner] Phase 1 done (all worlds): ${mergedListings.size} items in ${p1Elapsed}s`)

  // Phase 2: Home world (velocity + history) — unchanged
  console.log('[scanner] Phase 2: home world data...')
  const p2Start = Date.now()
  const homeResults = await fetchHomeListings(itemIds, makeProgressLogger('Phase 2'))
  const p2Elapsed = ((Date.now() - p2Start) / 1000).toFixed(1)
  console.log(`[scanner] Phase 2 done: ${homeResults.length} items in ${p2Elapsed}s`)

  let updated = 0
  for (const home of homeResults) {
    const dc = mergedListings.get(home.itemID)
    if (!dc) continue

    const itemData = buildItemData(
      home.itemID,
      dc.listings,
      dc.worldUploadTimes,
      {
        regularSaleVelocity: home.regularSaleVelocity,
        hqSaleVelocity: home.hqSaleVelocity,
        recentHistory: home.recentHistory as SaleRecord[],
        lastUploadTime: home.lastUploadTime,
      }
    )
    setItem(itemData)
    updated++
  }

  const now = Date.now()
  setScanMeta({
    scanCompletedAt: now,
    itemsScanned: updated,
    itemsWithOpportunities: getScanMeta().itemsWithOpportunities,
    nextScanEstimatedAt: now + SCAN_COOLDOWN_MS,
  })

  const elapsed = ((now - cycleStart) / 1000).toFixed(1)
  console.log(`[scanner] Scan complete: ${updated} items in ${elapsed}s`)
}
```

- [ ] **Step 3: Update the `startScanner` loop to use the strategy toggle**

Replace the `try` block inside the `while (true)` loop:

```typescript
    try {
      if (SCAN_STRATEGY === 'per-world') {
        await runScanCyclePerWorld(itemIds)
      } else {
        await runScanCycle(itemIds)
      }
    } catch (err) {
      console.error('[scanner] Scan cycle failed:', err)
    }
```

Also add a startup log line after the item list is fetched:

```typescript
  console.log(`[scanner] Using "${SCAN_STRATEGY}" scan strategy`)
```

- [ ] **Step 4: Run tests to verify nothing is broken**

Run: `bun test`
Expected: All existing tests PASS. (Scanner functions are not unit-tested directly — they're integration-level. We verify via the benchmark in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/server/scanner.ts
git commit -m "feat: add per-world scan strategy with SCAN_STRATEGY env toggle"
```

---

## Task 3: Update benchmark script to support both strategies

**Files:**
- Modify: `scripts/benchmark-scan.ts`

### Context

Add a `--strategy dc|per-world` flag so we can run both approaches on the same item set and compare results side by side. The benchmark should report per-world timing for the per-world strategy.

- [ ] **Step 1: Update the benchmark script**

Rewrite `scripts/benchmark-scan.ts` to support the new flag:

```typescript
// scripts/benchmark-scan.ts
// Usage: bun scripts/benchmark-scan.ts [--items N] [--strategy dc|per-world]

import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchWorldListings, DC_WORLDS } from '../src/server/universalis.ts'

const BATCH_SIZE = 100

function parseArgs(): { maxItems?: number; strategy: 'dc' | 'per-world' } {
  const itemsIdx = process.argv.indexOf('--items')
  const stratIdx = process.argv.indexOf('--strategy')
  return {
    maxItems: itemsIdx !== -1 && process.argv[itemsIdx + 1]
      ? parseInt(process.argv[itemsIdx + 1], 10)
      : undefined,
    strategy: (stratIdx !== -1 && process.argv[stratIdx + 1] === 'dc') ? 'dc' : 'per-world',
  }
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

async function benchmarkDC(itemIds: number[]) {
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)

  console.log('--- Phase 1: DC listings (all worlds in one response) ---')
  let p1Completed = 0
  const p1Start = performance.now()
  const dcResults = await fetchDCListings(itemIds, (done, total) => {
    p1Completed = done
    if (done === total || done % 10 === 0) {
      const elapsed = performance.now() - p1Start
      const rate = done / (elapsed / 1000)
      process.stdout.write(`\r  ${done}/${total} batches  (${rate.toFixed(1)} batch/s)`)
    }
  })
  const p1Time = performance.now() - p1Start
  console.log()
  const dcListingCount = dcResults.reduce((sum, r) => sum + r.listings.length, 0)
  console.log(`  Items returned: ${dcResults.length}`)
  console.log(`  Total listings: ${dcListingCount}`)
  console.log(`  Time: ${fmt(p1Time)}  (${(p1Completed / (p1Time / 1000)).toFixed(1)} batch/s, ${(dcResults.length / (p1Time / 1000)).toFixed(0)} items/s)`)

  return { p1Time, itemCount: dcResults.length, listingCount: dcListingCount, batches: totalBatches }
}

async function benchmarkPerWorld(itemIds: number[]) {
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)
  let totalListings = 0
  const worldTimings: { name: string; time: number; items: number }[] = []

  console.log(`--- Phase 1: Per-world listings (${DC_WORLDS.length} worlds sequential) ---`)
  const p1Start = performance.now()

  for (const world of DC_WORLDS) {
    const worldStart = performance.now()
    console.log(`  ${world.name}...`)
    const results = await fetchWorldListings(world, itemIds, (done, total) => {
      if (done === total || done % 10 === 0) {
        const elapsed = performance.now() - worldStart
        const rate = done / (elapsed / 1000)
        process.stdout.write(`\r    ${done}/${total} batches  (${rate.toFixed(1)} batch/s)`)
      }
    })
    const worldTime = performance.now() - worldStart
    console.log()
    const listings = results.reduce((sum, r) => sum + r.listings.length, 0)
    totalListings += listings
    worldTimings.push({ name: world.name, time: worldTime, items: results.length })
    console.log(`    ${world.name}: ${fmt(worldTime)}, ${results.length} items, ${listings} listings`)
  }

  const p1Time = performance.now() - p1Start
  console.log()
  console.log('  Per-world summary:')
  for (const w of worldTimings) {
    console.log(`    ${w.name}: ${fmt(w.time)}`)
  }
  console.log(`  Total Phase 1: ${fmt(p1Time)}`)
  console.log(`  Total listings: ${totalListings}`)

  return { p1Time, itemCount: itemIds.length, listingCount: totalListings, batches: totalBatches * DC_WORLDS.length }
}

async function main() {
  const { maxItems, strategy } = parseArgs()

  console.log(`Strategy: ${strategy}`)
  console.log()

  // Phase 0: Fetch marketable item list
  console.log('--- Phase 0: Fetching marketable item list ---')
  const p0Start = performance.now()
  let itemIds = await fetchMarketableItems()
  const p0Time = performance.now() - p0Start

  if (itemIds.length === 0) {
    console.error('Failed to fetch marketable items. Aborting.')
    process.exit(1)
  }
  console.log(`  Items: ${itemIds.length}  Time: ${fmt(p0Time)}`)

  if (maxItems && maxItems < itemIds.length) {
    console.log(`  Limiting to first ${maxItems} items`)
    itemIds = itemIds.slice(0, maxItems)
  }
  console.log()

  // Phase 1: strategy-dependent
  const p1Result = strategy === 'dc'
    ? await benchmarkDC(itemIds)
    : await benchmarkPerWorld(itemIds)
  console.log()

  // Phase 2: Home world (same for both strategies)
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)
  console.log('--- Phase 2: Home world (velocity + history) ---')
  let p2Completed = 0
  const p2Start = performance.now()
  const homeResults = await fetchHomeListings(itemIds, (done, total) => {
    p2Completed = done
    if (done === total || done % 10 === 0) {
      const elapsed = performance.now() - p2Start
      const rate = done / (elapsed / 1000)
      process.stdout.write(`\r  ${done}/${total} batches  (${rate.toFixed(1)} batch/s)`)
    }
  })
  const p2Time = performance.now() - p2Start
  console.log()
  console.log(`  Items returned: ${homeResults.length}`)
  console.log(`  Time: ${fmt(p2Time)}  (${(p2Completed / (p2Time / 1000)).toFixed(1)} batch/s, ${(homeResults.length / (p2Time / 1000)).toFixed(0)} items/s)`)
  console.log()

  // Summary
  const totalTime = p0Time + p1Result.p1Time + p2Time
  console.log('=== Summary ===')
  console.log(`  Strategy:         ${strategy}`)
  console.log(`  Items scanned:    ${itemIds.length}`)
  console.log(`  Phase 0 (items):  ${fmt(p0Time)}`)
  console.log(`  Phase 1 (${strategy === 'dc' ? 'DC' : 'per-world'}):${strategy === 'dc' ? '     ' : ' '}${fmt(p1Result.p1Time)}`)
  console.log(`  Phase 2 (Home):   ${fmt(p2Time)}`)
  console.log(`  Total wall-clock: ${fmt(totalTime)}`)
  console.log(`  Throughput:       ${(itemIds.length / (totalTime / 1000)).toFixed(0)} items/s`)
  console.log(`  HTTP batches:     ${p1Result.batches + totalBatches + 1}`)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run benchmark with both strategies (small item count for validation)**

```bash
bun scripts/benchmark-scan.ts --items 100 --strategy dc
bun scripts/benchmark-scan.ts --items 100 --strategy per-world
```

Verify both complete without errors and produce reasonable numbers.

- [ ] **Step 3: Commit**

```bash
git add scripts/benchmark-scan.ts
git commit -m "feat: benchmark supports --strategy dc|per-world for A/B comparison"
```

---

## Task 4: Run comparative benchmarks and record results

This is a manual validation step — run both strategies at the same item count and record the results.

- [ ] **Step 1: Run 500-item benchmark with DC strategy**

```bash
bun scripts/benchmark-scan.ts --items 500 --strategy dc
```

Record the Phase 1 time and total time.

- [ ] **Step 2: Run 500-item benchmark with per-world strategy**

```bash
bun scripts/benchmark-scan.ts --items 500 --strategy per-world
```

Record the Phase 1 time, per-world breakdown, and total time.

- [ ] **Step 3: Compare and decide**

Update the "Background & Motivation" section at the top of this plan with the actual benchmark results. If per-world is faster, keep `SCAN_STRATEGY` default as `'per-world'`. If DC is faster, switch the default back.

- [ ] **Step 4: Commit any benchmark result documentation**

```bash
git add docs/
git commit -m "docs: record per-world vs DC benchmark results"
```

---

## Notes

- **Phase 2 is unchanged** in both strategies — it always fetches from the home world only.
- **`fetchDCListings` is NOT deleted** — it remains available for benchmarking and as a fallback. The `SCAN_STRATEGY` env var controls which path runs.
- **The `ItemData` type is unchanged** — downstream code (scoring, API, client) is completely unaffected.
- **Universalis API v2 single-world response** does not include `worldID`/`worldName` in listings — we inject them from the world config. It also doesn't include `worldUploadTimes` — we build it from the per-item `lastUploadTime`.
