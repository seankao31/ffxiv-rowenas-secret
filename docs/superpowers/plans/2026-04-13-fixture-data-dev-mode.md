# Fixture Data Dev Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Final review includes cross-model verification via codex-review-gate.

**Goal:** Add a `FIXTURE_DATA=true` environment variable that pre-seeds the in-memory cache with snapshot data from a real Universalis scan, skipping the scanner entirely so `/api/opportunities` returns results immediately on dev server start.

**Architecture:** The `init()` hook in `src/hooks.server.ts` checks `process.env.FIXTURE_DATA`. When set, it calls `seedFixtureData()` (from `src/lib/server/fixtures/seed.ts`) which reads a checked-in JSON snapshot and populates the cache via the existing `setItem()`, `setNameMap()`, and `setScanMeta()` APIs. The scanner is never started. A one-time script (`scripts/snapshot-cache.ts`) captures real scan data into the snapshot file.

**Tech Stack:** TypeScript, Vitest, SvelteKit hooks, Node.js `fs`

---

### Task 1: Create `seedFixtureData()` with test

The core seeding function. It reads a JSON snapshot and populates the cache. We test it against the real cache module — no mocks.

**Files:**
- Create: `src/lib/server/fixtures/seed.ts`
- Create: `src/lib/server/fixtures/snapshot.json` (minimal placeholder for testing — will be replaced by real data in Task 3)
- Create: `tests/server/fixtures.test.ts`

**Snapshot JSON schema** (matches `ItemData` and name map from `src/lib/shared/types.ts`):

```json
{
  "items": [
    {
      "itemID": 5057,
      "worldUploadTimes": { "4030": 1712000000000, "4033": 1712000000000 },
      "homeLastUploadTime": 1712000000000,
      "listings": [
        { "pricePerUnit": 1000, "quantity": 5, "worldID": 4030, "worldName": "利維坦", "lastReviewTime": 1712000000000, "hq": false },
        { "pricePerUnit": 400, "quantity": 3, "worldID": 4033, "worldName": "巴哈姆特", "lastReviewTime": 1712000000000, "hq": false }
      ],
      "regularSaleVelocity": 10,
      "hqSaleVelocity": 5,
      "recentHistory": [
        { "pricePerUnit": 900, "quantity": 1, "timestamp": 1712000000000, "hq": false }
      ]
    }
  ],
  "names": { "5057": "Iron Ore" }
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/server/fixtures.test.ts`:

```typescript
import { test, expect, describe, beforeEach } from 'vitest'
import { seedFixtureData } from '$lib/server/fixtures/seed'
import { getAllItems, getNameMap, isCacheReady, getScanMeta } from '$lib/server/cache'

describe('seedFixtureData', () => {
  test('populates item cache from snapshot', () => {
    seedFixtureData()

    const items = getAllItems()
    expect(items.size).toBeGreaterThan(0)

    const first = items.values().next().value!
    expect(first.itemID).toBeTypeOf('number')
    expect(first.listings.length).toBeGreaterThan(0)
    expect(first.regularSaleVelocity).toBeTypeOf('number')
  })

  test('populates name cache from snapshot', () => {
    seedFixtureData()

    const names = getNameMap()
    expect(names.size).toBeGreaterThan(0)

    const items = getAllItems()
    const firstId = items.keys().next().value!
    expect(names.get(firstId)).toBeTypeOf('string')
  })

  test('marks cache as ready', () => {
    seedFixtureData()

    expect(isCacheReady()).toBe(true)

    const meta = getScanMeta()
    expect(meta.scanCompletedAt).toBeGreaterThan(0)
    expect(meta.itemsScanned).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/fixtures.test.ts`
Expected: FAIL — `$lib/server/fixtures/seed` does not exist yet.

- [ ] **Step 3: Create minimal snapshot JSON**

Create `src/lib/server/fixtures/snapshot.json` with a small set of 3 items covering different scenarios (one with HQ listings, one with multiple worlds, one with sale history). Use the schema above with real-ish world IDs from `src/lib/shared/universalis.ts` (4028–4035, home is 4030). Use timestamps relative to "recent" (e.g., `Date.now()` at generation time, but hardcoded in the file — the seeder will adjust them).

Use at least these 3 items:
- Item 5057: NQ-only, two worlds (4030 home, 4033 source), velocity 10, one history entry
- Item 5068: HQ listings, three worlds (4030, 4032, 4034), velocity 5/hqVelocity 3, two history entries
- Item 19925: Low velocity (1.5), single cheap source (4028), no history — tests edge case

- [ ] **Step 4: Write the implementation**

Create `src/lib/server/fixtures/seed.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setItem, setNameMap, setScanMeta } from '$lib/server/cache'
import type { ItemData } from '$lib/shared/types'

type Snapshot = {
  items: ItemData[]
  names: Record<string, string>
}

export function seedFixtureData(): void {
  const snapshotPath = join(dirname(fileURLToPath(import.meta.url)), 'snapshot.json')
  const raw = readFileSync(snapshotPath, 'utf-8')
  const snapshot: Snapshot = JSON.parse(raw)

  for (const item of snapshot.items) {
    setItem(item)
  }

  const nameMap = new Map<number, string>()
  for (const [id, name] of Object.entries(snapshot.names)) {
    nameMap.set(Number(id), name)
  }
  setNameMap(nameMap)

  setScanMeta({
    scanCompletedAt: Date.now(),
    itemsScanned: snapshot.items.length,
    itemsWithOpportunities: 0,
    nextScanEstimatedAt: 0,
  })

  console.log(`[fixtures] Seeded cache with ${snapshot.items.length} items`)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- tests/server/fixtures.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Run full test suite**

Run: `bun run test`
Expected: All 203+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/fixtures/seed.ts src/lib/server/fixtures/snapshot.json tests/server/fixtures.test.ts
git commit -m "feat(server): add seedFixtureData to populate cache from snapshot

Ref: ENG-118"
```

---

### Task 2: Wire fixture mode into `hooks.server.ts`

Gate the scanner on `FIXTURE_DATA` env var. When set, call `seedFixtureData()` instead.

**Files:**
- Modify: `src/hooks.server.ts:1-29`
- Create: `tests/server/hooks-fixture.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/hooks-fixture.test.ts`. This test verifies the branching logic — that when `FIXTURE_DATA` is set, `seedFixtureData` is called and `startScanner` is not.

We need to test the actual conditional logic. Since `hooks.server.ts` runs `init()` which has side effects (recipe loading, scanner start), we'll test by importing and checking the behavior. The simplest approach: test that after importing the fixture seeder and calling it, the cache is ready (already covered in Task 1). The integration test here is that `init()` respects the env var.

```typescript
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'

describe('hooks.server init() fixture mode', () => {
  const originalEnv = process.env['FIXTURE_DATA']

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['FIXTURE_DATA']
    } else {
      process.env['FIXTURE_DATA'] = originalEnv
    }
    vi.restoreAllMocks()
  })

  test('FIXTURE_DATA=true calls seedFixtureData instead of startScanner', async () => {
    process.env['FIXTURE_DATA'] = 'true'

    const seedMock = vi.fn()
    const scannerMock = vi.fn().mockResolvedValue(undefined)

    vi.doMock('$lib/server/fixtures/seed', () => ({ seedFixtureData: seedMock }))
    vi.doMock('$lib/server/scanner', () => ({ startScanner: scannerMock }))
    vi.doMock('$lib/server/recipes', () => ({ initRecipes: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('$lib/server/vendors', () => ({ fetchVendorPrices: vi.fn().mockResolvedValue(new Map()) }))
    vi.doMock('$lib/server/cache', () => ({ setVendorPrices: vi.fn() }))

    const { init } = await import('../../src/hooks.server')
    await init()

    expect(seedMock).toHaveBeenCalledOnce()
    expect(scannerMock).not.toHaveBeenCalled()
  })

  test('without FIXTURE_DATA, calls startScanner normally', async () => {
    delete process.env['FIXTURE_DATA']

    const seedMock = vi.fn()
    const scannerMock = vi.fn().mockReturnValue(new Promise(() => {}))

    vi.doMock('$lib/server/fixtures/seed', () => ({ seedFixtureData: seedMock }))
    vi.doMock('$lib/server/scanner', () => ({ startScanner: scannerMock }))
    vi.doMock('$lib/server/recipes', () => ({ initRecipes: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('$lib/server/vendors', () => ({ fetchVendorPrices: vi.fn().mockResolvedValue(new Map()) }))
    vi.doMock('$lib/server/cache', () => ({ setVendorPrices: vi.fn() }))

    const { init } = await import('../../src/hooks.server')
    await init()

    expect(scannerMock).toHaveBeenCalledOnce()
    expect(seedMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/hooks-fixture.test.ts`
Expected: FAIL — `seedFixtureData` is never called because `hooks.server.ts` doesn't check `FIXTURE_DATA` yet.

- [ ] **Step 3: Modify `hooks.server.ts`**

Update `src/hooks.server.ts` to add the fixture branch:

```typescript
import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices } from '$lib/server/vendors'
import { initRecipes } from '$lib/server/recipes'
import { setVendorPrices } from '$lib/server/cache'
import { seedFixtureData } from '$lib/server/fixtures/seed'

export async function init() {
  const recipePromise = initRecipes().catch(err => {
    console.error('[server] Recipe loading failed:', err)
    process.exit(1)
  })

  fetchVendorPrices()
    .then(prices => {
      if (prices.size > 0) setVendorPrices(prices)
    })
    .catch(err => {
      console.error('[server] Vendor price fetch failed after retries:', err)
    })

  await recipePromise

  if (process.env['FIXTURE_DATA']) {
    seedFixtureData()
  } else {
    startScanner().catch(err => {
      console.error('[server] Scanner crashed:', err)
      process.exit(1)
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/hooks-fixture.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks.server.ts tests/server/hooks-fixture.test.ts
git commit -m "feat(server): wire FIXTURE_DATA env var to skip scanner in init

Ref: ENG-118"
```

---

### Task 3: Create snapshot generation script

A script that runs a real scan and captures a subset to `snapshot.json`. This is run manually by developers.

**Files:**
- Create: `scripts/snapshot-cache.ts`

- [ ] **Step 1: Write the script**

Create `scripts/snapshot-cache.ts`:

```typescript
/**
 * Captures a snapshot of real Universalis market data for use with FIXTURE_DATA mode.
 *
 * Usage: bun run scripts/snapshot-cache.ts
 *
 * Runs a single scan cycle against the Universalis API, picks a representative
 * subset of items (~40), and writes them to src/lib/server/fixtures/snapshot.json.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchItemNames } from '../src/lib/server/universalis'
import { buildItemData } from '../src/lib/server/scanner'
import type { ItemData, Listing, SaleRecord } from '../src/lib/shared/types'

const TARGET_ITEMS = 40

async function main() {
  console.log('[snapshot] Fetching marketable item list...')
  const allItemIds = await fetchMarketableItems()
  if (allItemIds.length === 0) {
    console.error('[snapshot] Failed to fetch item list')
    process.exit(1)
  }
  console.log(`[snapshot] Found ${allItemIds.length} marketable items`)

  console.log('[snapshot] Loading item names...')
  const names = await fetchItemNames()

  // Take a random sample to get diverse items
  const shuffled = allItemIds.slice().sort(() => Math.random() - 0.5)
  const sampleIds = shuffled.slice(0, TARGET_ITEMS)
  console.log(`[snapshot] Scanning ${sampleIds.length} items...`)

  // Phase 1: DC listings
  const dcResults = await fetchDCListings(sampleIds, (done, total) => {
    if (done === total) console.log(`[snapshot] Phase 1 done: ${dcResults.length} items`)
  })
  const dcByItemId = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()
  for (const r of dcResults) {
    dcByItemId.set(r.itemID, { listings: r.listings as Listing[], worldUploadTimes: r.worldUploadTimes })
  }

  // Phase 2: Home world velocity + history
  const homeResults = await fetchHomeListings(sampleIds, (done, total) => {
    if (done === total) console.log(`[snapshot] Phase 2 done: ${homeResults.length} items`)
  })

  const items: ItemData[] = []
  const nameEntries: Record<string, string> = {}

  for (const home of homeResults) {
    const dc = dcByItemId.get(home.itemID)
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
    items.push(itemData)

    const name = names.get(home.itemID)
    if (name) nameEntries[String(home.itemID)] = name
  }

  const snapshot = { items, names: nameEntries }
  const outPath = join(import.meta.dir, '..', 'src', 'lib', 'server', 'fixtures', 'snapshot.json')
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`[snapshot] Wrote ${items.length} items to ${outPath}`)
}

main().catch(err => {
  console.error('[snapshot] Fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the script to generate real fixture data**

Run: `bun run scripts/snapshot-cache.ts`
Expected: Fetches from Universalis, writes ~40 items to `src/lib/server/fixtures/snapshot.json`.

- [ ] **Step 3: Verify fixture data loads correctly**

Run: `bun run test -- tests/server/fixtures.test.ts`
Expected: PASS — the real snapshot data passes the same tests written in Task 1.

- [ ] **Step 4: Run full test suite**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot-cache.ts src/lib/server/fixtures/snapshot.json
git commit -m "feat(server): add snapshot generation script and real fixture data

Ref: ENG-118"
```

---

### Task 4: Documentation

Update `CLAUDE.md` to document the fixture mode.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add fixture mode to Commands section**

In `CLAUDE.md`, add a new entry to the `## Commands` section after the existing entries:

```markdown
- `FIXTURE_DATA=true bun run dev` — start the dev server with pre-seeded cache data (skips Universalis scanner)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add FIXTURE_DATA usage to CLAUDE.md

Ref: ENG-118"
```

---

### Task 5: Manual verification

Verify the full flow works end-to-end.

- [ ] **Step 1: Start dev server with fixture data**

Run: `FIXTURE_DATA=true bun run dev`
Expected: Server starts, console shows `[fixtures] Seeded cache with N items`, no scanner output.

- [ ] **Step 2: Verify `/api/opportunities` returns data**

Run: `curl -s http://localhost:5173/api/opportunities | head -c 200`
Expected: JSON with `"opportunities":[...]` and `"meta":{...}` — NOT `"ready":false`.

- [ ] **Step 3: Stop the dev server**

Kill the dev server process started in Step 1.
