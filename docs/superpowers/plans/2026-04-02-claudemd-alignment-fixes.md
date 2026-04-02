# CLAUDE.md Alignment Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix test output cleanliness, coverage gaps, misplaced library tests, and code duplication flagged during CLAUDE.md alignment review.

**Architecture:** Five tasks targeting the server-side codebase. Tasks 1–2 export and test pure functions that were previously module-private. Task 3 adds console spies so test output is pristine. Task 4 replaces third-party library tests with tests of our own wrapper. Task 5 extracts a batch-fetch helper to reduce duplication across four structurally identical functions. Tasks 1–4 are independent; Task 5 should run last since it refactors universalis.ts (touched by Task 4).

**Tech Stack:** Bun test runner (`bun:test`), TypeScript, Express 5

---

## File Structure

**Create:**
- `tests/server/api.test.ts` — parseThresholds validation tests
- `tests/server/scanner.test.ts` — buildItemData tests

**Modify:**
- `src/server/api.ts:32` — export `parseThresholds`
- `src/server/scanner.ts:10` — export `buildItemData`
- `src/server/universalis.ts:55` — export `OutboundRateLimiter`, add `fetchBatched` helper
- `tests/server/universalis.test.ts` — console spies on all output-producing tests, replace library tests, add `fetchHomeListings`/`fetchHomeWorldCombined` characterization tests

---

### Task 1: Export and test `parseThresholds`

**Files:**
- Modify: `src/server/api.ts:32` (add `export` keyword)
- Create: `tests/server/api.test.ts`

**Why:** `parseThresholds` validates 5 parameters with defaults, type coercion, and range checks — all untested.

- [ ] **Step 1: Write the failing test file**

Create `tests/server/api.test.ts`:

```ts
import { test, expect, describe } from 'bun:test'
import { parseThresholds } from '../../src/server/api.ts'

describe('parseThresholds', () => {
  test('returns defaults when no query params provided', () => {
    const result = parseThresholds({})
    expect(result).toEqual({
      price_threshold: 2.0,
      listing_staleness_hours: 48,
      days_of_supply: 3,
      limit: 50,
      hq: false,
    })
  })

  test('parses valid string params into numbers', () => {
    const result = parseThresholds({
      price_threshold: '3.5',
      listing_staleness_hours: '24',
      days_of_supply: '7',
      limit: '100',
      hq: 'true',
    })
    expect(result).toEqual({
      price_threshold: 3.5,
      listing_staleness_hours: 24,
      days_of_supply: 7,
      limit: 100,
      hq: true,
    })
  })

  test('rejects price_threshold outside 1.0–10.0', () => {
    expect(parseThresholds({ price_threshold: '0.5' }))
      .toEqual({ error: 'price_threshold must be between 1.0 and 10.0' })
    expect(parseThresholds({ price_threshold: '11' }))
      .toEqual({ error: 'price_threshold must be between 1.0 and 10.0' })
  })

  test('rejects non-numeric price_threshold', () => {
    expect(parseThresholds({ price_threshold: 'abc' }))
      .toEqual({ error: 'price_threshold must be between 1.0 and 10.0' })
  })

  test('rejects listing_staleness_hours outside 1–720', () => {
    expect(parseThresholds({ listing_staleness_hours: '0' }))
      .toEqual({ error: 'listing_staleness_hours must be between 1 and 720' })
    expect(parseThresholds({ listing_staleness_hours: '721' }))
      .toEqual({ error: 'listing_staleness_hours must be between 1 and 720' })
  })

  test('rejects days_of_supply outside 1–30', () => {
    expect(parseThresholds({ days_of_supply: '0' }))
      .toEqual({ error: 'days_of_supply must be between 1 and 30' })
    expect(parseThresholds({ days_of_supply: '31' }))
      .toEqual({ error: 'days_of_supply must be between 1 and 30' })
  })

  test('rejects limit outside 1–200', () => {
    expect(parseThresholds({ limit: '0' }))
      .toEqual({ error: 'limit must be between 1 and 200' })
    expect(parseThresholds({ limit: '201' }))
      .toEqual({ error: 'limit must be between 1 and 200' })
  })

  test('hq is true only for exact string "true"', () => {
    expect((parseThresholds({ hq: 'true' }) as any).hq).toBe(true)
    expect((parseThresholds({ hq: 'false' }) as any).hq).toBe(false)
    expect((parseThresholds({ hq: '1' }) as any).hq).toBe(false)
    expect((parseThresholds({}) as any).hq).toBe(false)
  })

  test('accepts boundary values', () => {
    const result = parseThresholds({
      price_threshold: '1.0',
      listing_staleness_hours: '720',
      days_of_supply: '30',
      limit: '200',
    })
    expect('error' in result).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server/api.test.ts`
Expected: FAIL — `parseThresholds` is not exported

- [ ] **Step 3: Export `parseThresholds`**

In `src/server/api.ts`, change `function parseThresholds(` to `export function parseThresholds(`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server/api.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/server/api.test.ts src/server/api.ts
git commit -m "test: add tests for parseThresholds validation"
```

---

### Task 2: Export and test `buildItemData`

**Files:**
- Modify: `src/server/scanner.ts:10` (add `export` keyword)
- Create: `tests/server/scanner.test.ts`

**Why:** `buildItemData` has fallback logic for `homeLastUploadTime` — uses Phase 2's `lastUploadTime` when available, falls back to `worldUploadTimes[HOME_WORLD_ID]` otherwise.

- [ ] **Step 1: Write the failing test file**

Create `tests/server/scanner.test.ts`:

```ts
import { test, expect, describe } from 'bun:test'
import { buildItemData } from '../../src/server/scanner.ts'

const HOME_WORLD_ID = 4030

describe('buildItemData', () => {
  const baseDcListings = [
    { pricePerUnit: 1000, quantity: 5, worldID: HOME_WORLD_ID, worldName: '利維坦', lastReviewTime: 100, hq: false },
  ]
  const baseWorldUploadTimes = { [HOME_WORLD_ID]: 5000 }
  const baseHomeResult = {
    regularSaleVelocity: 10,
    hqSaleVelocity: 3,
    recentHistory: [{ pricePerUnit: 900, quantity: 1, timestamp: 100, hq: false }],
    lastUploadTime: 8000,
  }

  test('uses Phase 2 lastUploadTime as homeLastUploadTime when available', () => {
    const result = buildItemData(42, baseDcListings, baseWorldUploadTimes, baseHomeResult)

    expect(result.homeLastUploadTime).toBe(8000)
  })

  test('falls back to worldUploadTimes for home world when Phase 2 lastUploadTime is 0', () => {
    const result = buildItemData(42, baseDcListings, baseWorldUploadTimes, {
      ...baseHomeResult,
      lastUploadTime: 0,
    })

    expect(result.homeLastUploadTime).toBe(5000)
  })

  test('homeLastUploadTime is 0 when both sources are missing', () => {
    const result = buildItemData(42, baseDcListings, {}, {
      ...baseHomeResult,
      lastUploadTime: 0,
    })

    expect(result.homeLastUploadTime).toBe(0)
  })

  test('passes through all fields from inputs', () => {
    const result = buildItemData(42, baseDcListings, baseWorldUploadTimes, baseHomeResult)

    expect(result.itemID).toBe(42)
    expect(result.listings).toBe(baseDcListings)
    expect(result.worldUploadTimes).toBe(baseWorldUploadTimes)
    expect(result.regularSaleVelocity).toBe(10)
    expect(result.hqSaleVelocity).toBe(3)
    expect(result.recentHistory).toBe(baseHomeResult.recentHistory)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server/scanner.test.ts`
Expected: FAIL — `buildItemData` is not exported

- [ ] **Step 3: Export `buildItemData`**

In `src/server/scanner.ts`, change `function buildItemData(` to `export function buildItemData(`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server/scanner.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/server/scanner.test.ts src/server/scanner.ts
git commit -m "test: add tests for buildItemData fallback logic"
```

---

### Task 3: Make test output pristine

**Files:**
- Modify: `tests/server/universalis.test.ts`

**Why:** Tests that exercise error paths produce `console.warn`/`console.log` output that leaks to stdout. CLAUDE.md requires pristine output and that error output is captured and validated.

**Approach:** In each `describe` block that has output-producing tests, save original console methods at describe scope, restore in `afterEach`, mock per-test, and assert on expected messages.

Tests that produce output:
- `fetchMarketableItems`: "HTTP error" → 1 warn, "non-array JSON" → 1 warn
- `fetchDCListings`: "HTTP error" → 1 warn
- `fetchWorldListings`: "HTTP error" → 1 warn
- `fetchItemNames`: "decodes msgpack" → 1 log, "skips falsy" → 1 log, "HTTP error" → 1 warn, "corrupt payload" → 1 warn

- [ ] **Step 1: Add console capture to `fetchMarketableItems` describe**

Add `originalWarn` save/restore alongside existing `originalFetch`. Mock `console.warn` in the two error-path tests and assert:

```ts
describe('fetchMarketableItems', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  // ... existing "returns array of item IDs" test unchanged ...

  test('returns empty array when API returns HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchMarketableItems()

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[universalis] HTTP 500, skipping:')
    )
  })

  test('returns empty array when API returns non-array JSON', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchMarketableItems()

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      '[universalis] /marketable returned unexpected shape:',
      'object'
    )
  })
})
```

- [ ] **Step 2: Add console capture to `fetchDCListings` describe**

Same pattern — add `originalWarn` save/restore, mock in "HTTP error" test:

```ts
describe('fetchDCListings', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  // ... existing passing tests unchanged ...

  test('returns empty array when API returns HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchDCListings([2])

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[universalis] HTTP 500, skipping:')
    )
  })
})
```

- [ ] **Step 3: Add console capture to `fetchWorldListings` describe**

Same pattern for the "HTTP error" test:

```ts
describe('fetchWorldListings', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  // ... existing passing tests unchanged ...

  test('returns empty array when API returns HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings({ id: 4028, name: '伊弗利特' }, [2])

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[universalis] HTTP 500, skipping:')
    )
  })
})
```

- [ ] **Step 4: Add console capture to `fetchItemNames` describe**

This one needs both `console.warn` (error paths) and `console.log` (success paths):

```ts
describe('fetchItemNames', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  const originalLog = console.log

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    console.log = originalLog
  })

  test('decodes msgpack tw-items into id→name map', async () => {
    console.log = mock(() => {}) as typeof console.log
    const { encode } = await import('@msgpack/msgpack')
    const mockData = { '2': { tw: '火之碎晶' }, '7': { tw: '水之碎晶' } }
    globalThis.fetch = mock(async () =>
      new Response(encode(mockData), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(2)
    expect(result.get(2)).toBe('火之碎晶')
    expect(result.get(7)).toBe('水之碎晶')
    expect(console.log).toHaveBeenCalledWith('[universalis] Loaded 2 item names from FFXIV_Market')
  })

  test('skips entries with falsy tw field', async () => {
    console.log = mock(() => {}) as typeof console.log
    const { encode } = await import('@msgpack/msgpack')
    const mockData = { '2': { tw: '火之碎晶' }, '3': { tw: '' }, '4': { tw: null } }
    globalThis.fetch = mock(async () =>
      new Response(encode(mockData), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(1)
    expect(result.get(2)).toBe('火之碎晶')
    expect(result.has(3)).toBe(false)
    expect(result.has(4)).toBe(false)
    expect(console.log).toHaveBeenCalledWith('[universalis] Loaded 1 item names from FFXIV_Market')
  })

  test('returns empty map on HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(0)
    expect(console.warn).toHaveBeenCalledWith(
      '[universalis] Failed to fetch item names: HTTP 500'
    )
  })

  test('returns empty map on corrupt msgpack payload', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response(new Uint8Array([0xff, 0xfe, 0x00]), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(0)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[universalis] Failed to decode item names:')
    )
  })
})
```

- [ ] **Step 5: Run full test suite and verify pristine output**

Run: `bun test`
Expected: All tests PASS. No `[universalis]` messages in test output.

- [ ] **Step 6: Commit**

```bash
git add tests/server/universalis.test.ts
git commit -m "test: capture and assert on all console output for pristine test runs"
```

---

### Task 4: Replace library tests with `OutboundRateLimiter` wrapper tests

**Files:**
- Modify: `src/server/universalis.ts:55` (export `OutboundRateLimiter` class)
- Modify: `tests/server/universalis.test.ts:289–311` (replace describe block)

**Why:** The existing `RateLimiter (limiter library)` tests import and test the third-party `limiter` library directly — they don't exercise any project code. Replace with tests of the `OutboundRateLimiter` wrapper class.

- [ ] **Step 1: Write the replacement test block**

Replace the `RateLimiter (limiter library)` describe block (lines 289–311) with:

```ts
describe('OutboundRateLimiter', () => {
  test('getRate returns initial rate', () => {
    const limiter = new OutboundRateLimiter(7)
    expect(limiter.getRate()).toBe(7)
  })

  test('setRate updates the rate', () => {
    const limiter = new OutboundRateLimiter(5)
    limiter.setRate(15)
    expect(limiter.getRate()).toBe(15)
  })

  test('acquire resolves without error', async () => {
    const limiter = new OutboundRateLimiter(100)
    // High rate ensures acquire resolves immediately
    await limiter.acquire()
    expect(true).toBe(true)
  })
})
```

Add `OutboundRateLimiter` to the import on line 3:

```ts
import { Semaphore, OutboundRateLimiter, fetchMarketableItems, fetchDCListings, fetchWorldListings, fetchItemNames } from '../../src/server/universalis.ts'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server/universalis.test.ts`
Expected: FAIL — `OutboundRateLimiter` is not exported

- [ ] **Step 3: Export `OutboundRateLimiter`**

In `src/server/universalis.ts`, change `class OutboundRateLimiter {` to `export class OutboundRateLimiter {`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server/universalis.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/universalis.ts tests/server/universalis.test.ts
git commit -m "test: replace limiter library tests with OutboundRateLimiter wrapper tests"
```

---

### Task 5: Reduce code duplication in universalis.ts

**Files:**
- Modify: `src/server/universalis.ts` (extract `fetchBatched` helper, refactor four functions)
- Modify: `tests/server/universalis.test.ts` (add characterization tests for `fetchHomeListings` and `fetchHomeWorldCombined`)

**Why:** `fetchDCListings`, `fetchWorldListings`, `fetchHomeListings`, and `fetchHomeWorldCombined` share the same batch → Promise.all → fetchWithRetry → null-check → transform → flatten pattern. CLAUDE.md requires reducing code duplication.

#### Step group A: Characterization tests (before refactoring)

Add tests for `fetchHomeListings` and `fetchHomeWorldCombined` to establish a baseline before refactoring.

- [ ] **Step A1: Add `fetchHomeListings` and `fetchHomeWorldCombined` to imports**

```ts
import {
  Semaphore, OutboundRateLimiter,
  fetchMarketableItems, fetchDCListings, fetchWorldListings,
  fetchHomeListings, fetchHomeWorldCombined,
  fetchItemNames,
} from '../../src/server/universalis.ts'
```

- [ ] **Step A2: Write `fetchHomeListings` characterization tests**

Add after the `fetchWorldListings` describe block:

```ts
describe('fetchHomeListings', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test('extracts velocity and history from home world response', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: {
          regularSaleVelocity: 8.5,
          hqSaleVelocity: 2.1,
          recentHistory: [{ pricePerUnit: 500, quantity: 2, timestamp: 1000, hq: false }],
          lastUploadTime: 1_774_271_896_711,
        },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchHomeListings([2])

    expect(result.length).toBe(1)
    expect(result[0].itemID).toBe(2)
    expect(result[0].regularSaleVelocity).toBe(8.5)
    expect(result[0].hqSaleVelocity).toBe(2.1)
    expect(result[0].recentHistory).toEqual([{ pricePerUnit: 500, quantity: 2, timestamp: 1000, hq: false }])
  })

  test('defaults missing fields to zero/empty', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({ 2: {} }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchHomeListings([2])

    expect(result[0].regularSaleVelocity).toBe(0)
    expect(result[0].hqSaleVelocity).toBe(0)
    expect(result[0].recentHistory).toEqual([])
  })

  test('returns empty array on HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchHomeListings([2])

    expect(result).toEqual([])
  })
})
```

- [ ] **Step A3: Write `fetchHomeWorldCombined` characterization tests**

```ts
describe('fetchHomeWorldCombined', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test('returns both DC listings and home data from single API call', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: {
          listings: [{
            lastReviewTime: 1_774_271_895,
            pricePerUnit: 500, quantity: 3, hq: false,
          }],
          regularSaleVelocity: 8.5,
          hqSaleVelocity: 2.1,
          recentHistory: [{ pricePerUnit: 450, quantity: 1, timestamp: 1000, hq: false }],
          lastUploadTime: 1_774_271_896_711,
        },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchHomeWorldCombined([2])

    // DC result: listings with HOME_WORLD_ID injected, lastReviewTime converted to ms
    expect(result.dcResults.length).toBe(1)
    expect(result.dcResults[0].itemID).toBe(2)
    expect(result.dcResults[0].listings[0].worldID).toBe(4030)
    expect(result.dcResults[0].listings[0].worldName).toBe('利維坦')
    expect(result.dcResults[0].listings[0].lastReviewTime).toBe(1_774_271_895 * 1000)
    expect(result.dcResults[0].worldUploadTimes).toEqual({ 4030: 1_774_271_896_711 })

    // Home result: velocity + history
    expect(result.homeResults.length).toBe(1)
    expect(result.homeResults[0].regularSaleVelocity).toBe(8.5)
    expect(result.homeResults[0].recentHistory).toEqual([
      { pricePerUnit: 450, quantity: 1, timestamp: 1000, hq: false },
    ])
  })

  test('handles multi-item batch with correct per-item results', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: {
          listings: [{ lastReviewTime: 100, pricePerUnit: 500, quantity: 3, hq: false }],
          regularSaleVelocity: 8.5,
          hqSaleVelocity: 2.1,
          recentHistory: [],
          lastUploadTime: 1_774_271_896_711,
        },
        3: {
          listings: [{ lastReviewTime: 200, pricePerUnit: 700, quantity: 1, hq: true }],
          regularSaleVelocity: 4.0,
          hqSaleVelocity: 1.0,
          recentHistory: [{ pricePerUnit: 650, quantity: 1, timestamp: 2000, hq: true }],
          lastUploadTime: 1_774_271_900_000,
        },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchHomeWorldCombined([2, 3])

    expect(result.dcResults.length).toBe(2)
    expect(result.homeResults.length).toBe(2)

    const dc2 = result.dcResults.find(r => r.itemID === 2)!
    const dc3 = result.dcResults.find(r => r.itemID === 3)!
    expect(dc2.listings[0].worldID).toBe(4030)
    expect(dc3.listings[0].hq).toBe(true)

    const home2 = result.homeResults.find(r => r.itemID === 2)!
    const home3 = result.homeResults.find(r => r.itemID === 3)!
    expect(home2.regularSaleVelocity).toBe(8.5)
    expect(home3.recentHistory.length).toBe(1)
  })

  test('returns empty results on HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchHomeWorldCombined([2])

    expect(result.dcResults).toEqual([])
    expect(result.homeResults).toEqual([])
  })
})
```

- [ ] **Step A4: Run tests to verify characterization tests pass**

Run: `bun test tests/server/universalis.test.ts`
Expected: All tests PASS (new tests describe existing behavior)

- [ ] **Step A5: Commit**

```bash
git add tests/server/universalis.test.ts
git commit -m "test: add characterization tests for fetchHomeListings and fetchHomeWorldCombined"
```

#### Step group B: Extract `fetchBatched` helper

- [ ] **Step B1: Add the `fetchBatched` helper to universalis.ts**

Add after the `chunk` function (around line 120), before `fetchMarketableItems`:

```ts
type BatchResponse = { items?: Record<string, unknown> }

async function fetchBatched<T>(
  itemIds: number[],
  endpoint: string,
  transformItems: (items: Record<string, unknown>) => T[],
  onBatchDone?: ProgressCallback,
): Promise<T[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(endpoint)}/${ids}`
      ) as BatchResponse | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return []
      return transformItems(data.items)
    })
  )
  return results.flat()
}
```

- [ ] **Step B2: Refactor `fetchDCListings` to use `fetchBatched`**

Replace the function body:

```ts
export async function fetchDCListings(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<DCBatchResult[]> {
  type ApiItem = {
    itemID: number
    worldUploadTimes?: Record<string, number>
    listings: Array<{
      lastReviewTime: number
      pricePerUnit: number
      quantity: number
      worldID: number
      worldName: string
      hq: boolean
    }>
    lastUploadTime: number
  }
  return fetchBatched(itemIds, DC_NAME, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
      itemID: item.itemID,
      worldUploadTimes: item.worldUploadTimes ?? {},
      listings: (item.listings ?? []).map(l => ({
        lastReviewTime: l.lastReviewTime * 1000,
        pricePerUnit: l.pricePerUnit,
        quantity: l.quantity,
        worldID: l.worldID,
        worldName: l.worldName,
        hq: l.hq,
      })),
      lastUploadTime: item.lastUploadTime ?? 0,
    })),
    onBatchDone,
  )
}
```

- [ ] **Step B3: Run tests to verify `fetchDCListings` still passes**

Run: `bun test tests/server/universalis.test.ts`
Expected: All tests PASS

- [ ] **Step B4: Refactor `fetchWorldListings` to use `fetchBatched`**

```ts
export async function fetchWorldListings(
  world: { id: number; name: string },
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<DCBatchResult[]> {
  type ApiItem = {
    itemID: number
    lastUploadTime: number
    listings: Array<{
      lastReviewTime: number
      pricePerUnit: number
      quantity: number
      hq: boolean
    }>
  }
  return fetchBatched(itemIds, world.name, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
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
    })),
    onBatchDone,
  )
}
```

- [ ] **Step B5: Run tests to verify `fetchWorldListings` still passes**

Run: `bun test tests/server/universalis.test.ts`
Expected: All tests PASS

- [ ] **Step B6: Refactor `fetchHomeListings` to use `fetchBatched`**

```ts
export async function fetchHomeListings(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<HomeBatchResult[]> {
  type ApiItem = {
    itemID: number
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: HomeBatchResult['recentHistory']
    lastUploadTime: number
  }
  return fetchBatched(itemIds, HOME_WORLD, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
      itemID: item.itemID,
      regularSaleVelocity: item.regularSaleVelocity ?? 0,
      hqSaleVelocity: item.hqSaleVelocity ?? 0,
      recentHistory: item.recentHistory ?? [],
      lastUploadTime: item.lastUploadTime ?? 0,
    })),
    onBatchDone,
  )
}
```

- [ ] **Step B7: Refactor `fetchHomeWorldCombined` to use `fetchBatched`**

```ts
export async function fetchHomeWorldCombined(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<HomeWorldCombinedResult> {
  type ApiItem = {
    itemID: number
    lastUploadTime: number
    listings: Array<{
      lastReviewTime: number
      pricePerUnit: number
      quantity: number
      hq: boolean
    }>
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: HomeBatchResult['recentHistory']
  }
  type Combined = { dc: DCBatchResult; home: HomeBatchResult }
  const combined = await fetchBatched<Combined>(itemIds, HOME_WORLD, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
      dc: {
        itemID: item.itemID,
        worldUploadTimes: { [HOME_WORLD_ID]: item.lastUploadTime ?? 0 },
        listings: (item.listings ?? []).map(l => ({
          lastReviewTime: l.lastReviewTime * 1000,
          pricePerUnit: l.pricePerUnit,
          quantity: l.quantity,
          worldID: HOME_WORLD_ID,
          worldName: HOME_WORLD,
          hq: l.hq,
        })),
        lastUploadTime: item.lastUploadTime ?? 0,
      },
      home: {
        itemID: item.itemID,
        regularSaleVelocity: item.regularSaleVelocity ?? 0,
        hqSaleVelocity: item.hqSaleVelocity ?? 0,
        recentHistory: item.recentHistory ?? [],
        lastUploadTime: item.lastUploadTime ?? 0,
      },
    })),
    onBatchDone,
  )
  return {
    dcResults: combined.map(c => c.dc),
    homeResults: combined.map(c => c.home),
  }
}
```

- [ ] **Step B8: Run full test suite**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step B9: Commit**

```bash
git add src/server/universalis.ts
git commit -m "refactor: extract fetchBatched helper to reduce duplication in universalis.ts"
```
