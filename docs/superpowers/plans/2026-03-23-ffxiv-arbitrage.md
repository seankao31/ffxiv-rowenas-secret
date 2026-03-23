# FFXIV Cross-World Arbitrage Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun/Express backend with Svelte frontend that scans Universalis market data and surfaces confidence-weighted cross-world arbitrage opportunities for the 陸行鳥 data center.

**Architecture:** Single Bun/Express process runs a continuous two-phase scan loop (Universalis → in-memory cache), scores the full cache on each API request with user-supplied threshold parameters, and serves both the REST API and the Svelte SPA as static files. Scoring applies asymmetric staleness decay: 3h half-life for home-world data (financial risk), 12h for source-world data (trip risk only).

**Tech Stack:** Bun runtime + Bun test runner, Express 5, TypeScript 5, Svelte 5 + Vite 6, PM2 (deployment).

---

## File Map

| Path | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts (start, test, build:client, dev) |
| `tsconfig.json` | TypeScript config — strict mode, Bun targets |
| `vite.config.ts` | Svelte plugin, output to `dist/client/` |
| `index.html` | Vite SPA entry point |
| `src/client/main.ts` | Mounts App.svelte |
| `src/shared/types.ts` | Listing, SaleRecord, ItemData, Opportunity, ScanMeta, ThresholdParams |
| `src/server/cache.ts` | In-memory `Map<itemID, ItemData>` + scan meta state |
| `src/server/universalis.ts` | Semaphore + RateLimiter + fetchBatch() with retry |
| `src/server/scanner.ts` | Startup item list + name map fetch; two-phase scan loop |
| `src/server/scoring.ts` | `scoreOpportunities()`: pure function, cache → Opportunity[] |
| `src/server/api.ts` | Express router: GET /api/opportunities |
| `src/server/index.ts` | App assembly: Express + scanner start + static serve |
| `src/client/lib/api.ts` | `fetchOpportunities()` wrapper + shared response types |
| `src/client/components/StaleBadge.svelte` | Coloured freshness indicator |
| `src/client/components/StatusBar.svelte` | Last scan time + countdown + opp count |
| `src/client/components/ThresholdControls.svelte` | Collapsible threshold sliders panel |
| `src/client/components/OpportunityTable.svelte` | Ranked table with alt world rows + expandable details |
| `src/client/App.svelte` | State owner: polling, thresholds, error/loading |
| `tests/server/scoring.test.ts` | Unit tests for scoring formula |
| `tests/server/universalis.test.ts` | Unit tests for rate limiter + retry logic |

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/client/main.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "ffxiv-arbitrage",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun src/server/index.ts",
    "dev:server": "bun --watch src/server/index.ts",
    "dev:client": "vite",
    "build:client": "vite build",
    "test": "bun test"
  },
  "dependencies": {
    "express": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte": "^5.0.0",
    "vite": "^6.0.0",
    "@types/express": "^5.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist/client',
  },
  root: '.',
})
```

- [ ] **Step 4: Write index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FFXIV Arbitrage</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/client/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write src/client/main.ts**

```typescript
import { mount } from 'svelte'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
```

- [ ] **Step 6: Install dependencies**

Run: `bun install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/client/main.ts
git commit -m "chore: scaffold project — Bun/Express backend + Svelte/Vite frontend"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write types**

```typescript
// src/shared/types.ts

export type Listing = {
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  lastReviewTime: number  // unix ms — per-listing, when Universalis last saw this retainer
  hq: boolean
}

export type SaleRecord = {
  pricePerUnit: number
  quantity: number
  timestamp: number
  hq: boolean
}

export type ItemData = {
  itemID: number
  // worldID → unix ms. Derived: max(lastReviewTime) across all listings per worldID.
  // Only worlds that have at least one listing in Phase 1 appear here.
  worldUploadTimes: Record<number, number>
  // Authoritative home freshness from Phase 2 lastUploadTime.
  // Falls back to worldUploadTimes[4030] if Phase 2 returns 0 (sold-out board).
  homeLastUploadTime: number
  listings: Listing[]             // all worlds in DC (Phase 1)
  regularSaleVelocity: number     // 利維坦-specific, HQ+NQ combined (Phase 2)
  hqSaleVelocity: number          // 利維坦-specific, HQ only (Phase 2)
  recentHistory: SaleRecord[]     // 利維坦-specific (Phase 2)
}

export type ScanMeta = {
  scanCompletedAt: number           // unix ms; 0 = no scan complete yet
  itemsScanned: number
  itemsWithOpportunities: number
  nextScanEstimatedAt: number       // unix ms
}

export type ThresholdParams = {
  price_threshold: number           // multiplier, default 2.0
  listing_staleness_hours: number   // default 48
  days_of_supply: number            // default 3
  limit: number                     // default 50, max 200
  hq: boolean                       // default false
}

export type Opportunity = {
  itemID: number
  itemName: string

  buyPrice: number
  sellPrice: number
  profitPerUnit: number
  tax: number

  sourceWorld: string
  sourceWorldID: number

  altSourceWorld?: string
  altSourceWorldID?: number
  altBuyPrice?: number
  altExpectedDailyProfit?: number
  altSourceConfidence?: number
  altSourceDataAgeHours?: number

  availableUnits: number
  recommendedUnits: number
  expectedDailyProfit: number

  score: number

  homeDataAgeHours: number
  homeConfidence: number

  sourceDataAgeHours: number
  sourceConfidence: number

  activeCompetitorCount: number
  fairShareVelocity: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: In-Memory Cache

**Files:**
- Create: `src/server/cache.ts`

The cache is a module-level singleton. `scanner.ts` writes to it; `scoring.ts` and `api.ts` read from it.

- [ ] **Step 1: Write cache.ts**

```typescript
// src/server/cache.ts
import type { ItemData, ScanMeta } from '../shared/types.ts'

const itemCache = new Map<number, ItemData>()
const nameCache = new Map<number, string>()  // itemID → display name

let scanMeta: ScanMeta = {
  scanCompletedAt: 0,
  itemsScanned: 0,
  itemsWithOpportunities: 0,
  nextScanEstimatedAt: 0,
}

export function setItem(data: ItemData): void {
  itemCache.set(data.itemID, data)
}

export function getAllItems(): Map<number, ItemData> {
  return itemCache
}

export function setItemName(itemID: number, name: string): void {
  nameCache.set(itemID, name)
}

export function getNameMap(): Map<number, string> {
  return nameCache
}

export function isCacheReady(): boolean {
  return scanMeta.scanCompletedAt > 0
}

export function setScanMeta(meta: ScanMeta): void {
  scanMeta = meta
}

export function getScanMeta(): ScanMeta {
  return scanMeta
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/cache.ts
git commit -m "feat: add in-memory cache module"
```

---

### Task 4: Universalis API Client (with tests)

**Files:**
- Create: `src/server/universalis.ts`
- Create: `tests/server/universalis.test.ts`

This module owns all HTTP calls to Universalis. Internally it uses a Semaphore (8 concurrent) and RateLimiter (20 req/s) with exponential backoff on 429.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/server/universalis.test.ts
import { test, expect, describe } from 'bun:test'
import { RateLimiter, Semaphore } from '../../src/server/universalis.ts'

describe('Semaphore', () => {
  test('never exceeds max concurrent', async () => {
    const sem = new Semaphore(3)
    let concurrent = 0
    let maxConcurrent = 0
    const tasks = Array.from({ length: 10 }, () =>
      sem.run(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(r => setTimeout(r, 10))
        concurrent--
      })
    )
    await Promise.all(tasks)
    expect(maxConcurrent).toBeLessThanOrEqual(3)
    expect(maxConcurrent).toBeGreaterThan(0)
  })
})

describe('RateLimiter', () => {
  test('allows burst up to rate', async () => {
    const limiter = new RateLimiter(100)
    // Should be able to acquire 10 tokens immediately (well within 100/s budget)
    for (let i = 0; i < 10; i++) {
      await limiter.acquire()
    }
    // If we reach here without timeout, the rate limiter didn't block unnecessarily
    expect(true).toBe(true)
  })

  test('delays when token bucket is exhausted', async () => {
    const limiter = new RateLimiter(10)  // 10 req/s = 1 token per 100ms
    // Drain the initial tokens
    for (let i = 0; i < 10; i++) await limiter.acquire()
    // Next acquire should wait ~100ms
    const start = Date.now()
    await limiter.acquire()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThan(50)  // generous lower bound
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `bun test tests/server/universalis.test.ts`
Expected: FAIL — `RateLimiter` and `Semaphore` not exported.

- [ ] **Step 3: Write universalis.ts**

```typescript
// src/server/universalis.ts
const DC_NAME = '陸行鳥'
const HOME_WORLD = '利維坦'
const BASE_URL = 'https://universalis.app/api/v2'
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3

export class Semaphore {
  private count: number
  private readonly queue: (() => void)[] = []

  constructor(count: number) {
    this.count = count
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--
      return Promise.resolve()
    }
    return new Promise(resolve => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.count++
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly msPerToken: number

  constructor(ratePerSecond: number) {
    this.maxTokens = ratePerSecond
    this.tokens = ratePerSecond
    this.lastRefill = Date.now()
    this.msPerToken = 1000 / ratePerSecond
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed / this.msPerToken)
    this.lastRefill = now

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    const waitMs = (1 - this.tokens) * this.msPerToken
    await new Promise<void>(resolve => setTimeout(resolve, waitMs))
    this.tokens = 0
    this.lastRefill = Date.now()
  }
}

const semaphore = new Semaphore(8)
const rateLimiter = new RateLimiter(20)

async function fetchWithRetry(url: string, retries = 0): Promise<unknown> {
  await rateLimiter.acquire()
  return semaphore.run(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (res.status === 429) {
        if (retries >= MAX_RETRIES) {
          console.warn(`[universalis] 429 after ${MAX_RETRIES} retries, skipping: ${url}`)
          return null
        }
        const backoff = Math.pow(2, retries) * 1000
        console.warn(`[universalis] 429, retrying in ${backoff}ms (attempt ${retries + 1})`)
        await new Promise(r => setTimeout(r, backoff))
        return fetchWithRetry(url, retries + 1)
      }
      if (!res.ok) {
        console.warn(`[universalis] HTTP ${res.status}, skipping: ${url}`)
        return null
      }
      return res.json()
    } catch (err) {
      if (retries >= MAX_RETRIES) {
        console.warn(`[universalis] request failed after ${MAX_RETRIES} retries: ${url}`)
        return null
      }
      const backoff = Math.pow(2, retries) * 1000
      await new Promise(r => setTimeout(r, backoff))
      return fetchWithRetry(url, retries + 1)
    } finally {
      clearTimeout(timeout)
    }
  })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function fetchMarketableItems(): Promise<number[]> {
  const data = await fetchWithRetry(`${BASE_URL}/marketable`) as number[] | null
  return data ?? []
}

export async function fetchItemName(itemID: number): Promise<string | null> {
  const data = await fetchWithRetry(
    `${BASE_URL}/extra/content/item/${itemID}`
  ) as { name?: string } | null
  return data?.name ?? null
}

export type DCBatchResult = {
  itemID: number
  listings: Array<{
    pricePerUnit: number
    quantity: number
    worldID: number
    worldName: string
    lastReviewTime: number
    hq: boolean
  }>
  lastUploadTime: number
}

export type HomeBatchResult = {
  itemID: number
  regularSaleVelocity: number
  hqSaleVelocity: number
  recentHistory: Array<{
    pricePerUnit: number
    quantity: number
    timestamp: number
    hq: boolean
  }>
  lastUploadTime: number
}

export async function fetchDCListings(itemIds: number[]): Promise<DCBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(DC_NAME)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          listings: DCBatchResult['listings']
          lastUploadTime: number
        }>
      } | null
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        listings: item.listings ?? [],
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}

export async function fetchHomeListings(itemIds: number[]): Promise<HomeBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(HOME_WORLD)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          regularSaleVelocity: number
          hqSaleVelocity: number
          recentHistory: HomeBatchResult['recentHistory']
          lastUploadTime: number
        }>
      } | null
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        regularSaleVelocity: item.regularSaleVelocity ?? 0,
        hqSaleVelocity: item.hqSaleVelocity ?? 0,
        recentHistory: item.recentHistory ?? [],
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `bun test tests/server/universalis.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/universalis.ts tests/server/universalis.test.ts
git commit -m "feat: add Universalis API client with rate limiter and concurrency pool"
```

---

### Task 5: Scanner

**Files:**
- Create: `src/server/scanner.ts`

The scanner owns startup (fetch item list, kick off background name hydration) and the continuous scan loop (Phase 1 DC → Phase 2 home → update cache → cooldown → repeat).

**Note on name hydration:** Item name fetching is done in a background loop at ~20 req/s using a per-item endpoint. It runs independently and non-blockingly — scanner starts and produces results immediately; names appear in API responses as they are resolved. The `getNameMap()` fallback in scoring returns `"Item #${id}"` until the name is ready.

- [ ] **Step 1: Write scanner.ts**

```typescript
// src/server/scanner.ts
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchItemName } from './universalis.ts'
import { setItem, setItemName, setScanMeta, getScanMeta } from './cache.ts'
import type { ItemData, Listing, SaleRecord } from '../shared/types.ts'

const HOME_WORLD_ID = 4030
const SCAN_COOLDOWN_MS = 60_000

async function hydrateNames(itemIds: number[]): Promise<void> {
  for (const id of itemIds) {
    try {
      const name = await fetchItemName(id)
      if (name) setItemName(id, name)
    } catch {
      // non-fatal — name resolution is best-effort
    }
    await new Promise(r => setTimeout(r, 50))  // ~20 names/s
  }
}

function buildItemData(
  itemID: number,
  dcListings: Listing[],
  homeResult: {
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: SaleRecord[]
    lastUploadTime: number
  }
): ItemData {
  // Derive worldUploadTimes: max(lastReviewTime) per worldID across all DC listings
  const worldUploadTimes: Record<number, number> = {}
  for (const listing of dcListings) {
    const current = worldUploadTimes[listing.worldID] ?? 0
    if (listing.lastReviewTime > current) {
      worldUploadTimes[listing.worldID] = listing.lastReviewTime
    }
  }

  // homeLastUploadTime: authoritative from Phase 2; fallback for sold-out home boards
  const homeLastUploadTime = homeResult.lastUploadTime > 0
    ? homeResult.lastUploadTime
    : (worldUploadTimes[HOME_WORLD_ID] ?? 0)

  return {
    itemID,
    worldUploadTimes,
    homeLastUploadTime,
    listings: dcListings,
    regularSaleVelocity: homeResult.regularSaleVelocity,
    hqSaleVelocity: homeResult.hqSaleVelocity,
    recentHistory: homeResult.recentHistory,
  }
}

async function runScanCycle(itemIds: number[]): Promise<void> {
  const cycleStart = Date.now()
  console.log(`[scanner] Starting scan of ${itemIds.length} items`)

  // Phase 1: DC-level listings (all worlds)
  console.log('[scanner] Phase 1: DC listings...')
  const dcResults = await fetchDCListings(itemIds)

  const dcByItemId = new Map<number, { listings: Listing[] }>()
  for (const r of dcResults) {
    dcByItemId.set(r.itemID, { listings: r.listings as Listing[] })
  }

  // Phase 2: Home world (velocity + history)
  console.log('[scanner] Phase 2: home world data...')
  const homeResults = await fetchHomeListings(itemIds)

  let updated = 0
  for (const home of homeResults) {
    const dc = dcByItemId.get(home.itemID)
    if (!dc) continue

    const itemData = buildItemData(
      home.itemID,
      dc.listings,
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

export async function startScanner(): Promise<void> {
  let itemIds: number[] = []
  while (itemIds.length === 0) {
    console.log('[scanner] Fetching marketable item list...')
    itemIds = await fetchMarketableItems()
    if (itemIds.length === 0) {
      console.warn('[scanner] Failed to fetch item list, retrying in 30s')
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
  console.log(`[scanner] Found ${itemIds.length} marketable items`)

  // Background name hydration — does not block first scan
  hydrateNames(itemIds).catch(err => console.error('[scanner] Name hydration error:', err))

  while (true) {
    try {
      await runScanCycle(itemIds)
    } catch (err) {
      console.error('[scanner] Scan cycle failed:', err)
    }
    await new Promise(r => setTimeout(r, SCAN_COOLDOWN_MS))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/scanner.ts
git commit -m "feat: add two-phase scan loop with background name hydration"
```

---

### Task 6: Scoring (with tests)

**Files:**
- Create: `tests/server/scoring.test.ts`
- Create: `src/server/scoring.ts`

Scoring is a pure function — write tests first.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/server/scoring.test.ts
import { test, expect, describe } from 'bun:test'
import { scoreOpportunities } from '../../src/server/scoring.ts'
import type { ItemData, ThresholdParams } from '../../src/shared/types.ts'

const HOME = 4030
const SRC_A = 4033  // 巴哈姆特
const SRC_B = 4032  // 奧汀

const DEFAULT: ThresholdParams = {
  price_threshold: 2.0,
  listing_staleness_hours: 48,
  days_of_supply: 3,
  limit: 50,
  hq: false,
}

const NOW = Date.now()
const FRESH = NOW - 30 * 60_000        // 30 min ago
const STALE20H = NOW - 20 * 3_600_000  // 20 hours ago
const TOO_OLD = NOW - 50 * 3_600_000   // 50 hours ago (beyond 48h staleness cutoff)

function item(overrides: Partial<ItemData> = {}): ItemData {
  return {
    itemID: 1,
    worldUploadTimes: { [HOME]: FRESH, [SRC_B]: FRESH },
    homeLastUploadTime: FRESH,
    listings: [
      { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
      { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
    ],
    regularSaleVelocity: 10,
    hqSaleVelocity: 5,
    recentHistory: [],
    ...overrides,
  }
}

const names = new Map([[1, 'Iron Ore'], [2, 'Steel Ingot']])

describe('scoreOpportunities', () => {
  test('returns opportunity for profitable item', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.itemID).toBe(1)
    expect(r.itemName).toBe('Iron Ore')
    expect(r.profitPerUnit).toBe(550)  // 1000*0.95 - 400 = 550
    expect(r.sourceWorldID).toBe(SRC_B)
  })

  test('excludes item when no profitable source world', () => {
    const noProfit = item({
      listings: [
        { pricePerUnit: 500, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 600, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    // profit = 500*0.95 - 600 = -125 → skip
    expect(scoreOpportunities(new Map([[1, noProfit]]), names, DEFAULT)).toHaveLength(0)
  })

  test('excludes item with zero velocity', () => {
    expect(
      scoreOpportunities(new Map([[1, item({ regularSaleVelocity: 0 })]]), names, DEFAULT)
    ).toHaveLength(0)
  })

  test('excludes item with no home-world listings at all', () => {
    const noHome = item({
      listings: [
        // Only source-world listing — no home listing
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    expect(scoreOpportunities(new Map([[1, noHome]]), names, DEFAULT)).toHaveLength(0)
  })

  test('excludes item when all home listings are too old', () => {
    const staleHome = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: TOO_OLD, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    expect(scoreOpportunities(new Map([[1, staleHome]]), names, DEFAULT)).toHaveLength(0)
  })

  test('dead listing price threshold: only counts listings within 2× cheapest as active', () => {
    const withDead = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
        // Dead listing at 3× cheapest on source — outside 2× threshold, excluded from active
        { pricePerUnit: 1200, quantity: 99, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, withDead]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.buyPrice).toBe(400)  // cheapest active price unaffected
  })

  test('picks confidence-adjusted best world, not cheapest', () => {
    const twoWorlds: ItemData = {
      itemID: 1,
      worldUploadTimes: {
        [HOME]: FRESH,
        [SRC_A]: STALE20H,  // cheap but 20h old → low confidence
        [SRC_B]: FRESH,     // pricier but fresh → high confidence
      },
      homeLastUploadTime: FRESH,
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 300, quantity: 3, worldID: SRC_A, worldName: '巴哈姆特', lastReviewTime: STALE20H, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 10,
      hqSaleVelocity: 5,
      recentHistory: [],
    }
    const results = scoreOpportunities(new Map([[1, twoWorlds]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    // 奧汀 (SRC_B) should win despite higher buy price — fresh data
    expect(results[0]!.sourceWorldID).toBe(SRC_B)
    // 巴哈姆特 (SRC_A) should appear as alt — higher raw profit
    expect(results[0]!.altSourceWorldID).toBe(SRC_A)
  })

  test('no alt world when only one profitable source', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results[0]!.altSourceWorld).toBeUndefined()
  })

  test('hq=true uses hqSaleVelocity and filters to HQ listings only', () => {
    const mixed: ItemData = {
      ...item(),
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: true },
        { pricePerUnit: 800, quantity: 2, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: true },
        { pricePerUnit: 200, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      hqSaleVelocity: 4,
    }
    const results = scoreOpportunities(new Map([[1, mixed]]), names, { ...DEFAULT, hq: true })
    expect(results).toHaveLength(1)
    expect(results[0]!.buyPrice).toBe(400)   // HQ source price
    expect(results[0]!.sellPrice).toBe(1000) // HQ home price
    // fairShareVelocity = hqSaleVelocity(4) / (1 HQ competitor + 1) = 2
    expect(results[0]!.fairShareVelocity).toBeCloseTo(2)
  })

  test('recommendedUnits capped by days_of_supply', () => {
    const plenty: ItemData = {
      ...item(),
      regularSaleVelocity: 10,
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 100, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    }
    const results = scoreOpportunities(new Map([[1, plenty]]), names, { ...DEFAULT, days_of_supply: 3 })
    // fairShare = 10 / 2 = 5/day; maxUnits = ceil(5 * 3) = 15
    expect(results[0]!.recommendedUnits).toBe(15)
    expect(results[0]!.availableUnits).toBe(100)
  })

  test('respects limit parameter', () => {
    const cache = new Map<number, ItemData>()
    for (let i = 1; i <= 10; i++) {
      cache.set(i, {
        ...item({ itemID: i }),
        listings: [
          { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
          { pricePerUnit: 400 - i, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
        ],
      })
    }
    const nameMap = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, `Item ${i + 1}`]))
    const results = scoreOpportunities(cache, nameMap, { ...DEFAULT, limit: 5 })
    expect(results).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `bun test tests/server/scoring.test.ts`
Expected: FAIL — `scoreOpportunities` not found.

- [ ] **Step 3: Write scoring.ts**

```typescript
// src/server/scoring.ts
import type { ItemData, Opportunity, ThresholdParams } from '../shared/types.ts'

const HOME_WORLD_ID = 4030
const MARKET_TAX = 0.05
// Time constants match spec pseudocode: exp(-age / τ)
// home τ=3h → at 3h, confidence≈0.368; at 6h≈0.135 (steep — financial risk)
// source τ=12h → at 12h, confidence≈0.368 (gentle — trip risk only)
const HOME_TIME_CONSTANT_H = 3
const SOURCE_TIME_CONSTANT_H = 12
const MS_PER_HOUR = 3_600_000

function confidence(ageHours: number, timeConstantHours: number): number {
  return Math.exp(-ageHours / timeConstantHours)
}

export function scoreOpportunities(
  cache: Map<number, ItemData>,
  nameMap: Map<number, string>,
  params: ThresholdParams
): Opportunity[] {
  const now = Date.now()
  const stalenessCutoff = now - params.listing_staleness_hours * MS_PER_HOUR
  const opportunities: Opportunity[] = []

  for (const item of cache.values()) {
    const allListings = params.hq ? item.listings.filter(l => l.hq) : item.listings

    // --- Active home listings ---
    const homeListings = allListings.filter(l => l.worldID === HOME_WORLD_ID)
    if (homeListings.length === 0) continue

    const minHomePrice = Math.min(...homeListings.map(l => l.pricePerUnit))
    const activeHomeListings = homeListings.filter(l =>
      l.pricePerUnit <= minHomePrice * params.price_threshold &&
      l.lastReviewTime >= stalenessCutoff
    )
    if (activeHomeListings.length === 0) continue

    const cheapestHomePrice = Math.min(...activeHomeListings.map(l => l.pricePerUnit))
    const activeCompetitorCount = activeHomeListings.length

    // --- Velocity ---
    const velocity = params.hq ? item.hqSaleVelocity : item.regularSaleVelocity
    if (velocity === 0) continue
    const fairShareVelocity = velocity / (activeCompetitorCount + 1)

    // --- Home confidence ---
    const homeAgeHours = (now - item.homeLastUploadTime) / MS_PER_HOUR
    const homeConf = confidence(homeAgeHours, HOME_TIME_CONSTANT_H)

    // --- Per-source-world scoring ---
    type WorldResult = {
      worldID: number
      worldName: string
      cheapestSource: number
      profitPerUnit: number
      sourceAgeHours: number
      sourceConf: number
      worldScore: number
      availableUnits: number
    }

    const sourceListings = allListings.filter(l => l.worldID !== HOME_WORLD_ID)
    const worldIds = [...new Set(sourceListings.map(l => l.worldID))]
    const worldResults: WorldResult[] = []

    for (const worldID of worldIds) {
      const wListings = sourceListings.filter(l => l.worldID === worldID)
      const minSrcPrice = Math.min(...wListings.map(l => l.pricePerUnit))
      const activeSrc = wListings.filter(l =>
        l.pricePerUnit <= minSrcPrice * params.price_threshold &&
        l.lastReviewTime >= stalenessCutoff
      )
      if (activeSrc.length === 0) continue

      const cheapestSource = Math.min(...activeSrc.map(l => l.pricePerUnit))
      const profitPerUnit = cheapestHomePrice * (1 - MARKET_TAX) - cheapestSource
      if (profitPerUnit <= 0) continue

      const uploadTime = item.worldUploadTimes[worldID] ?? 0
      const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
      const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H)
      const worldScore = profitPerUnit * fairShareVelocity * homeConf * sourceConf

      // Count only units at the exact cheapest price (multiple retainers at same price all count)
      const availableUnits = activeSrc
        .filter(l => l.pricePerUnit === cheapestSource)
        .reduce((sum, l) => sum + l.quantity, 0)

      worldResults.push({
        worldID,
        worldName: wListings[0]!.worldName,
        cheapestSource,
        profitPerUnit,
        sourceAgeHours,
        sourceConf,
        worldScore,
        availableUnits,
      })
    }

    if (worldResults.length === 0) continue

    // Best = highest confidence-adjusted score
    const best = worldResults.reduce((a, b) => b.worldScore > a.worldScore ? b : a)

    // Alt = highest raw profitPerUnit excluding best world
    const altCandidates = worldResults.filter(w => w.worldID !== best.worldID)
    const alt = altCandidates.length > 0
      ? altCandidates.reduce((a, b) => b.profitPerUnit > a.profitPerUnit ? b : a)
      : null

    const maxUnits = Math.ceil(fairShareVelocity * params.days_of_supply)
    const recommendedUnits = Math.min(best.availableUnits, maxUnits)

    const opp: Opportunity = {
      itemID: item.itemID,
      itemName: nameMap.get(item.itemID) ?? `Item #${item.itemID}`,

      buyPrice: best.cheapestSource,
      sellPrice: cheapestHomePrice,
      profitPerUnit: Math.round(best.profitPerUnit),
      tax: Math.round(cheapestHomePrice * MARKET_TAX),

      sourceWorld: best.worldName,
      sourceWorldID: best.worldID,

      availableUnits: best.availableUnits,
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
      opp.altBuyPrice = alt.cheapestSource
      opp.altExpectedDailyProfit = Math.round(alt.profitPerUnit * fairShareVelocity)
      opp.altSourceConfidence = Math.round(alt.sourceConf * 1000) / 1000
      opp.altSourceDataAgeHours = Math.round(alt.sourceAgeHours * 10) / 10
    }

    opportunities.push(opp)
  }

  opportunities.sort((a, b) => b.score - a.score)
  return opportunities.slice(0, params.limit)
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `bun test tests/server/scoring.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/scoring.ts tests/server/scoring.test.ts
git commit -m "feat: add scoring engine with confidence-weighted multi-world ranking"
```

---

### Task 7: API Routes

**Files:**
- Create: `src/server/api.ts`

- [x] **Step 1: Write api.ts**

```typescript
// src/server/api.ts
import { Router } from 'express'
import { getAllItems, getNameMap, isCacheReady, getScanMeta, setScanMeta } from './cache.ts'
import { scoreOpportunities } from './scoring.ts'
import type { ThresholdParams } from '../shared/types.ts'

export const router = Router()

function parseThresholds(query: Record<string, unknown>): ThresholdParams | { error: string } {
  const price_threshold = query['price_threshold'] !== undefined
    ? Number(query['price_threshold']) : 2.0
  const listing_staleness_hours = query['listing_staleness_hours'] !== undefined
    ? Number(query['listing_staleness_hours']) : 48
  const days_of_supply = query['days_of_supply'] !== undefined
    ? Number(query['days_of_supply']) : 3
  const limit = query['limit'] !== undefined ? Number(query['limit']) : 50
  const hq = query['hq'] === 'true'

  if (isNaN(price_threshold) || price_threshold < 1.0 || price_threshold > 10.0)
    return { error: 'price_threshold must be between 1.0 and 10.0' }
  if (isNaN(listing_staleness_hours) || listing_staleness_hours < 1 || listing_staleness_hours > 720)
    return { error: 'listing_staleness_hours must be between 1 and 720' }
  if (isNaN(days_of_supply) || days_of_supply < 1 || days_of_supply > 30)
    return { error: 'days_of_supply must be between 1 and 30' }
  if (isNaN(limit) || limit < 1 || limit > 200)
    return { error: 'limit must be between 1 and 200' }

  return { price_threshold, listing_staleness_hours, days_of_supply, limit, hq }
}

router.get('/opportunities', (req, res) => {
  if (!isCacheReady()) {
    res.status(202).json({ ready: false, message: 'Scan in progress, results available in ~25s' })
    return
  }

  const params = parseThresholds(req.query as Record<string, unknown>)
  if ('error' in params) {
    res.status(400).json({ error: params.error })
    return
  }

  try {
    const opportunities = scoreOpportunities(getAllItems(), getNameMap(), params)

    // Keep itemsWithOpportunities current in meta
    const meta = getScanMeta()
    setScanMeta({ ...meta, itemsWithOpportunities: opportunities.length })

    res.json({ opportunities, meta: getScanMeta() })
  } catch (err) {
    console.error('[api] Scoring error:', err)
    res.status(500).json({ error: 'Internal scoring error' })
  }
})
```

- [x] **Step 2: Commit**

```bash
git add src/server/api.ts
git commit -m "feat: add REST API route for opportunities with threshold validation"
```

---

### Task 8: Express Entry Point

**Files:**
- Create: `src/server/index.ts`

- [x] **Step 1: Write index.ts**

```typescript
// src/server/index.ts
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { router } from './api.ts'
import { startScanner } from './scanner.ts'

const app = express()
const PORT = process.env['PORT'] ?? 3000

app.use('/api', router)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../../dist/client')
app.use(express.static(clientDist))

// SPA fallback for client-side routing (Express 5 requires named wildcard)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`)
})

startScanner().catch(err => {
  console.error('[server] Scanner crashed:', err)
  process.exit(1)
})
```

- [x] **Step 2: Verify backend boots**

Create stub client dist so the server can start without a real build:
```bash
mkdir -p dist/client
echo '<!doctype html><html><body>stub</body></html>' > dist/client/index.html
```

Run: `bun src/server/index.ts`
Expected output (first 5s):
```
[server] Listening on http://localhost:3000
[scanner] Fetching marketable item list...
[scanner] Found NNNNN marketable items
[scanner] Phase 1: DC listings...
```
Stop with Ctrl+C.

- [x] **Step 3: Verify API returns 202 before first scan**

While the server is starting (within first ~25s), run:
```bash
curl http://localhost:3000/api/opportunities
```
Expected: `{"ready":false,"message":"Scan in progress..."}`

- [x] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: wire up Express app with scanner and static file serving"
```

---

### Task 9: Client API Wrapper

**Files:**
- Create: `src/client/lib/api.ts`

- [ ] **Step 1: Write api.ts**

```typescript
// src/client/lib/api.ts
import type { Opportunity, ScanMeta, ThresholdParams } from '../../shared/types.ts'

export type { Opportunity, ScanMeta }
export type ThresholdState = ThresholdParams

export type OpportunitiesResponse = {
  opportunities: Opportunity[]
  meta: ScanMeta
}

export async function fetchOpportunities(params: ThresholdState): Promise<OpportunitiesResponse | null> {
  const query = new URLSearchParams({
    price_threshold: String(params.price_threshold),
    listing_staleness_hours: String(params.listing_staleness_hours),
    days_of_supply: String(params.days_of_supply),
    limit: String(params.limit),
    hq: String(params.hq),
  })
  const res = await fetch(`/api/opportunities?${query}`)
  if (res.status === 202) return null  // cold start — caller shows loading state
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<OpportunitiesResponse>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/lib/api.ts
git commit -m "feat: add client API wrapper"
```

---

### Task 10: StaleBadge.svelte

**Files:**
- Create: `src/client/components/StaleBadge.svelte`

- [ ] **Step 1: Write StaleBadge.svelte**

```svelte
<!-- src/client/components/StaleBadge.svelte -->
<script lang="ts">
  const { confidence, ageHours }: { confidence: number; ageHours: number } = $props()

  const colour = $derived(
    confidence >= 0.85 ? '🟢' :
    confidence >= 0.60 ? '🟡' :
    confidence >= 0.25 ? '🟠' : '🔴'
  )

  const label = $derived(
    ageHours < 1
      ? `${Math.round(ageHours * 60)}min ago`
      : `${ageHours.toFixed(1)}h ago`
  )
</script>

<span title="Data age: {label}">{colour} {label}</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/StaleBadge.svelte
git commit -m "feat: add StaleBadge component"
```

---

### Task 11: StatusBar.svelte

**Files:**
- Create: `src/client/components/StatusBar.svelte`

- [ ] **Step 1: Write StatusBar.svelte**

```svelte
<!-- src/client/components/StatusBar.svelte -->
<script lang="ts">
  import type { ScanMeta } from '../lib/api.ts'

  const { meta }: { meta: ScanMeta } = $props()

  let secondsUntilNext = $state(0)
  let lastScanLabel = $state('never')
  let isStale = $state(false)
  let isVeryStale = $state(false)

  // Single interval updates all time-dependent display state every second
  $effect(() => {
    const update = () => {
      const now = Date.now()
      secondsUntilNext = Math.max(0, Math.round((meta.nextScanEstimatedAt - now) / 1000))
      if (meta.scanCompletedAt === 0) {
        lastScanLabel = 'never'
        isStale = false
        isVeryStale = false
        return
      }
      const s = Math.round((now - meta.scanCompletedAt) / 1000)
      lastScanLabel = s < 60 ? `${s}s ago` : `${Math.round(s / 60)}min ago`
      isStale = now - meta.scanCompletedAt > 10 * 60_000
      isVeryStale = now - meta.scanCompletedAt > 30 * 60_000
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  })
</script>

{#if isVeryStale}
  <div class="bar severe">⚠️ Data very outdated — last scan {lastScanLabel}</div>
{:else if isStale}
  <div class="bar stale">⚠️ Data may be outdated — last scan {lastScanLabel}</div>
{:else}
  <div class="bar">
    Last scan: {lastScanLabel} · Next in: {secondsUntilNext}s · {meta.itemsWithOpportunities} opportunities
  </div>
{/if}

<style>
  .bar        { padding: 8px 16px; background: #1a1a2e; color: #aaa; font-size: 13px; }
  .stale      { background: #3a2a00; color: #ffc107; }
  .severe     { background: #3a0000; color: #ff6b6b; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/StatusBar.svelte
git commit -m "feat: add StatusBar with live countdown and staleness banners"
```

---

### Task 12: ThresholdControls.svelte

**Files:**
- Create: `src/client/components/ThresholdControls.svelte`

- [ ] **Step 1: Write ThresholdControls.svelte**

```svelte
<!-- src/client/components/ThresholdControls.svelte -->
<script lang="ts">
  import type { ThresholdState } from '../lib/api.ts'

  let {
    thresholds,
    onchange,
  }: { thresholds: ThresholdState; onchange: (t: ThresholdState) => void } = $props()

  let open = $state(false)

  function emit(patch: Partial<ThresholdState>) {
    onchange({ ...thresholds, ...patch })
  }
</script>

<div class="panel">
  <button class="toggle" onclick={() => (open = !open)}>
    ⚙ Filters {open ? '▲' : '▼'}
  </button>

  {#if open}
    <div class="controls">
      <label>
        Price threshold: {thresholds.price_threshold}×
        <input type="range" min="1.2" max="5.0" step="0.1"
          value={thresholds.price_threshold}
          oninput={(e) => emit({ price_threshold: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label>
        Listing staleness: {thresholds.listing_staleness_hours}h
        <input type="range" min="1" max="168" step="1"
          value={thresholds.listing_staleness_hours}
          oninput={(e) => emit({ listing_staleness_hours: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label>
        Days of supply: {thresholds.days_of_supply}
        <input type="range" min="1" max="14" step="1"
          value={thresholds.days_of_supply}
          oninput={(e) => emit({ days_of_supply: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label class="inline">
        <input type="checkbox"
          checked={thresholds.hq}
          onchange={(e) => emit({ hq: (e.target as HTMLInputElement).checked })}
        />
        HQ only
      </label>

      <label>
        Results:
        <select
          value={String(thresholds.limit)}
          onchange={(e) => emit({ limit: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .panel   { background: #16213e; border-bottom: 1px solid #333; }
  .toggle  { width: 100%; padding: 10px 16px; background: none; border: none; color: #ccc; cursor: pointer; text-align: left; font-size: 14px; }
  .controls { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 16px 16px; }
  label    { display: flex; flex-direction: column; gap: 4px; color: #aaa; font-size: 13px; min-width: 160px; }
  .inline  { flex-direction: row; align-items: center; gap: 8px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/ThresholdControls.svelte
git commit -m "feat: add collapsible ThresholdControls panel"
```

---

### Task 13: OpportunityTable.svelte

**Files:**
- Create: `src/client/components/OpportunityTable.svelte`

- [ ] **Step 1: Write OpportunityTable.svelte**

```svelte
<!-- src/client/components/OpportunityTable.svelte -->
<script lang="ts">
  import StaleBadge from './StaleBadge.svelte'
  import type { Opportunity } from '../lib/api.ts'

  const { opportunities }: { opportunities: Opportunity[] } = $props()

  let expanded = $state(new Set<number>())

  function toggle(id: number) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded = next
  }

  const fmt = (n: number) => n.toLocaleString()
</script>

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th>Buy from</th>
      <th>Buy</th>
      <th>Sell</th>
      <th>Profit/unit</th>
      <th>Units</th>
      <th>/day</th>
      <th>Home data</th>
      <th>Source data</th>
    </tr>
  </thead>
  <tbody>
    {#each opportunities as opp (opp.itemID)}
      <tr class="main" onclick={() => toggle(opp.itemID)}>
        <td>
          <a href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener"
            onclick={(e) => e.stopPropagation()}>
            {opp.itemName}
          </a>
        </td>
        <td>{opp.sourceWorld}</td>
        <td>{fmt(opp.buyPrice)}</td>
        <td>{fmt(opp.sellPrice)}</td>
        <td>{fmt(opp.profitPerUnit)}</td>
        <td>{opp.recommendedUnits} / {opp.availableUnits}</td>
        <td>{fmt(opp.expectedDailyProfit)}</td>
        <td><StaleBadge confidence={opp.homeConfidence} ageHours={opp.homeDataAgeHours} /></td>
        <td><StaleBadge confidence={opp.sourceConfidence} ageHours={opp.sourceDataAgeHours} /></td>
      </tr>

      {#if opp.altSourceWorld}
        <tr class="alt">
          <td colspan="9" class="alt-cell">
            Alt: {opp.altSourceWorld} — buy {fmt(opp.altBuyPrice ?? 0)} — {fmt(opp.altExpectedDailyProfit ?? 0)}/day
            {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
              <StaleBadge confidence={opp.altSourceConfidence} ageHours={opp.altSourceDataAgeHours} />
            {/if}
          </td>
        </tr>
      {/if}

      {#if expanded.has(opp.itemID)}
        <tr class="detail">
          <td colspan="9">
            <div class="detail-inner">
              <span>Competitors: {opp.activeCompetitorCount}</span>
              <span>Fair share velocity: {opp.fairShareVelocity}/day</span>
              <span>Tax: {fmt(opp.tax)} gil</span>
            </div>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>

<style>
  table  { width: 100%; border-collapse: collapse; font-size: 14px; }
  th     { padding: 8px 12px; background: #1a1a2e; color: #777; text-align: left; font-weight: 500; }
  td     { padding: 8px 12px; border-bottom: 1px solid #1e1e2e; color: #ccc; }
  .main  { cursor: pointer; }
  .main:hover td { background: #1e2240; }
  .alt td   { background: #141428; padding: 3px 12px 3px 28px; font-size: 12px; color: #777; }
  .detail td { background: #12122a; }
  .detail-inner { display: flex; gap: 24px; padding: 6px; color: #666; font-size: 12px; }
  a { color: #7eb8f7; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/OpportunityTable.svelte
git commit -m "feat: add OpportunityTable with alt rows and expandable detail"
```

---

### Task 14: App.svelte — Final Assembly

**Files:**
- Create: `src/client/App.svelte`

- [ ] **Step 1: Write App.svelte**

```svelte
<!-- src/client/App.svelte -->
<script lang="ts">
  import { fetchOpportunities, type Opportunity, type ScanMeta, type ThresholdState } from './lib/api.ts'
  import StatusBar from './components/StatusBar.svelte'
  import ThresholdControls from './components/ThresholdControls.svelte'
  import OpportunityTable from './components/OpportunityTable.svelte'

  let opportunities = $state<Opportunity[]>([])
  let meta = $state<ScanMeta>({
    scanCompletedAt: 0,
    itemsScanned: 0,
    itemsWithOpportunities: 0,
    nextScanEstimatedAt: 0,
  })
  let loading = $state(true)
  let coldStart = $state(false)
  let error = $state<string | null>(null)
  let thresholds = $state<ThresholdState>({
    price_threshold: 2.0,
    listing_staleness_hours: 48,
    days_of_supply: 3,
    limit: 50,
    hq: false,
  })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function loadData() {
    try {
      error = null
      const result = await fetchOpportunities(thresholds)
      if (result === null) {
        coldStart = true
        loading = false
        return
      }
      coldStart = false
      opportunities = result.opportunities
      meta = result.meta
      loading = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      loading = false
    }
  }

  function onThresholdChange(next: ThresholdState) {
    thresholds = next
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadData, 500)
  }

  $effect(() => {
    loadData()
    const interval = setInterval(loadData, 30_000)
    return () => clearInterval(interval)
  })
</script>

<div class="app">
  {#if meta.scanCompletedAt > 0}
    <StatusBar {meta} />
  {/if}

  <ThresholdControls {thresholds} onchange={onThresholdChange} />

  <main>
    {#if coldStart}
      <p class="msg">⏳ Initial scan in progress — first results in ~25s…</p>
    {:else if loading}
      <p class="msg">Loading…</p>
    {:else if error}
      <p class="msg err">Error: {error}</p>
    {:else if opportunities.length === 0}
      <p class="msg">No opportunities found with current filters.</p>
    {:else}
      <OpportunityTable {opportunities} />
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #0f0f1a; font-family: system-ui, sans-serif; }
  .app { min-height: 100vh; }
  .msg { padding: 32px; color: #666; text-align: center; }
  .err { color: #ff6b6b; }
</style>
```

- [ ] **Step 2: Build the client**

Run: `bun run build:client`
Expected: `dist/client/` populated, no TypeScript errors.

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 4: End-to-end smoke test**

Run: `bun src/server/index.ts`
Open `http://localhost:3000` in a browser.
Expected sequence:
1. Dashboard loads immediately
2. Shows "⏳ Initial scan in progress…" for ~25s
3. Populates with ranked opportunities
4. StatusBar shows last scan time and countdown
5. Threshold sliders trigger a new fetch (debounced 500ms)

- [ ] **Step 5: Commit**

```bash
git add src/client/App.svelte
git commit -m "feat: add App.svelte — polling, threshold debounce, full dashboard assembly"
```

---

## Final Checklist

- [ ] `bun test` — all tests pass
- [ ] `bun run build:client` — no TypeScript errors
- [ ] Server boots and reaches `[scanner] Scan complete` within ~25s
- [ ] `GET /api/opportunities` returns ranked JSON after first scan
- [ ] Dashboard renders and auto-refreshes every 30s
- [ ] Threshold changes trigger debounced re-fetch
- [ ] StaleBadge colours reflect asymmetric confidence (3h home vs 12h source)
