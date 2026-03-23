# FFXIV Cross-World Arbitrage Tool — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

A web-based dashboard for identifying profitable cross-world market board arbitrage opportunities in FFXIV. The tool buys items cheaply from other worlds in the same data center and sells them on the user's home world for a profit. It uses the Universalis crowdsourced market board API as its data source.

**Home world:** 利維坦 (ID 4030)
**Data center:** 陸行鳥 (Traditional Chinese cluster, 8 worlds)
**Source worlds:** 伊弗利特 (4028), 迦樓羅 (4029), 鳳凰 (4031), 奧汀 (4032), 巴哈姆特 (4033), 拉姆 (4034), 泰坦 (4035)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Bun |
| Backend framework | Express |
| Frontend framework | Svelte + Vite (plain Svelte, not SvelteKit) |
| Language | TypeScript throughout |
| Process manager | PM2 (on AWS EC2) |
| Persistence | In-memory cache only (v1) |
| Server build | None — Bun runs `.ts` directly |
| Client build | `vite build` → `dist/client/`, served as Express static files |

---

## Project Structure

```
ffxiv-arbitrage/
├── src/
│   ├── server/
│   │   ├── index.ts          # Entry point — starts Express + scan loop
│   │   ├── scanner.ts        # Scan loop: batches items, calls Universalis
│   │   ├── universalis.ts    # Universalis API client (rate limiting, concurrency)
│   │   ├── cache.ts          # In-memory store of raw scan data
│   │   ├── scoring.ts        # Scoring formula — raw cache + thresholds → ranked list
│   │   └── api.ts            # Express routes
│   └── client/
│       ├── App.svelte
│       ├── lib/
│       │   └── api.ts        # fetch wrapper for backend REST calls
│       └── components/
│           ├── OpportunityTable.svelte
│           ├── ThresholdControls.svelte
│           ├── StatusBar.svelte
│           └── StaleBadge.svelte
├── dist/
│   ├── server/               # Compiled (unused — Bun runs src directly)
│   └── client/               # Built Svelte app
├── docs/
│   ├── decisions/            # Architecture Decision Records
│   └── superpowers/specs/    # This file
└── package.json
```

---

## Architecture

A single Bun/Express process on AWS EC2 handles everything: running the scan loop, caching results in memory, serving the REST API, and serving the Svelte frontend as static files.

```
EC2 Process (Bun)
├── scanner.ts  ──▶  cache.ts (raw data, ~100MB)
│                        │
│                    scoring.ts (on each API request)
│                        │
└── api.ts  ◀────────────┘
     ├── GET /api/opportunities   (scored, ranked results)
     ├── GET /api/status
     └── static /                 (Svelte build)
                │
          Browser polls every 30s
```

The scan loop is entirely I/O-bound (`await fetch(...)`) and never blocks the Node.js event loop. The frontend and API share the same origin, eliminating CORS configuration.

---

## Data Flow & Scan Cycle

### Item List

At startup the scanner fetches all tradeable item IDs from:
```
GET https://universalis.app/api/v2/marketable
```
This is **never hardcoded** — new items added in FFXIV patches are automatically included. Infrastructure is sized for 20,000 items (above the ~16,000 currently tradeable as of early 2026).

### Two-Phase Scan

Each scan cycle runs two sequential phases, each batching items 100 at a time.

**Phase 1 — DC-level query**
```
GET /api/v2/陸行鳥/{itemIds}
```
Returns listings from all 8 worlds in the DC, each tagged with `worldID`/`worldName`. Extracted data:
- All listings with `pricePerUnit`, `quantity`, `worldID`, `lastReviewTime`
- Item-level `lastUploadTime`

**Phase 2 — Home world query**
```
GET /api/v2/利維坦/{itemIds}
```
Returns 利維坦-specific data. Extracted data:
- `regularSaleVelocity` — units sold per day on 利維坦 (DC-level velocity would overestimate)
- `recentHistory` — recent actual sales

### Rate Limiting

- **Concurrency:** max 8 simultaneous connections (Universalis hard cap)
- **Rate:** 20 req/s (below the 25 req/s hard limit — headroom for retries and burst variance)
- **On 429:** exponential backoff (1s → 2s → 4s), max 3 retries, skip batch, log warning
- **Phase ordering:** Phase 1 completes fully before Phase 2 begins (shared connection pool)

### Scan Cycle Timing (20,000-item baseline)

```
Phase 1: ~200 calls at 20 req/s  ≈ 10s
Phase 2: ~200 calls at 20 req/s  ≈ 10s
Network overhead                 ≈  5s
Cooldown (configurable)         = 60s
─────────────────────────────────────
Total cycle interval:           ≈ 85s
```

### In-Memory Cache Shape

```typescript
type Listing = {
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  lastReviewTime: number  // unix ms — per-listing staleness
  hq: boolean
}

type SaleRecord = {
  pricePerUnit: number
  quantity: number
  timestamp: number
  hq: boolean
}

type ItemData = {
  itemID: number
  worldUploadTimes: Record<number, number>  // worldID → unix ms
                                            // derived: max(lastReviewTime) per world
  homeLastUploadTime: number                // alias for worldUploadTimes[4030]
  listings: Listing[]                       // all worlds in DC
  regularSaleVelocity: number              // 利維坦-specific
  recentHistory: SaleRecord[]             // 利維坦-specific
}

const cache = new Map<number, ItemData>()  // itemID → ItemData
```

**Per-world staleness derivation:** The Universalis DC-level response does not provide per-world upload timestamps. They are derived as:
```
worldUploadTimes[worldID] = max(lastReviewTime of all listings on that world)
```
This is a well-grounded approximation: Universalis uploaders scan the full market board when uploading, so the newest listing timestamp reliably reflects the last full board scan on that world.

---

## Scoring Pipeline

Scoring runs **on every API request** — not during the scan. The full raw cache is scored with the caller's threshold parameters and the top-N results returned.

### Step 1 — Resolve Active Listings

```
home_listings   = listings where worldID == 4030
source_listings = listings where worldID != 4030

active_home_listings = home_listings where:
  pricePerUnit <= min(home_listings.pricePerUnit) × price_threshold_multiplier
  AND lastReviewTime >= now - listing_staleness_cutoff

active_source_listings[world] = source_listings for that world where:
  pricePerUnit <= min(source_listings[world].pricePerUnit) × price_threshold_multiplier
  AND lastReviewTime >= now - listing_staleness_cutoff
```

### Step 2 — Per-World Scoring

The recommended source world is the one with the highest confidence-adjusted score — **not** necessarily the cheapest. This accounts for per-world staleness differences.

```
MARKET_TAX = 0.05

for each source_world (excluding 利維坦):
  cheapest_source = min(active_source_listings[world].pricePerUnit)
  if no active listings on world: skip

  profit_per_unit = cheapest_home × (1 - TAX) - cheapest_source
  if profit_per_unit <= 0: skip

  source_age_hours = (now - worldUploadTimes[world]) / 3_600_000
  source_confidence = exp(-source_age_hours / 12)

  world_score = profit_per_unit × fair_share_velocity × home_confidence × source_confidence

best_source_world = world with max world_score
item_score        = best_source_world.world_score
```

### Step 3 — Shared Components

```
fair_share_velocity = regularSaleVelocity / (active_competitor_count + 1)
  where active_competitor_count = count(active_home_listings)

home_age_hours    = (now - homeLastUploadTime) / 3_600_000
home_confidence   = exp(-home_age_hours / 3)    ← steep: 3h half-life (financial risk)
source_confidence = exp(-source_age_hours / 12) ← gentle: 12h half-life (trip risk only)

max_units        = ceil(fair_share_velocity × days_of_supply_cap)
effective_units  = min(available_units_on_best_source, max_units)

expected_daily_profit = profit_per_unit × fair_share_velocity  ← shown to user (no confidence)
score                 = profit_per_unit × fair_share_velocity × home_confidence × source_confidence
```

`score` and `expected_daily_profit` are kept separate: `expected_daily_profit` is the raw economic value displayed in gil/day; `score` is the confidence-weighted value used purely for ranking. Showing confidence-adjusted numbers as gil amounts would be misleading.

### Staleness Asymmetry

Risk is asymmetric by direction:

| Stale data | Consequence | Reversible? |
|---|---|---|
| Source world price (buy side) | Travel there, see real price, choose not to buy | ✅ Yes — wasted trip only |
| Home world price (sell side) | Already bought items; arrive home to crashed market | ❌ No — money committed |

Hence the steeper home confidence decay (3h half-life vs. 12h for source). Stale data is never excluded entirely — it retains heuristic value and is visually flagged instead.

### API Endpoint

```
GET /api/opportunities
  ?price_threshold=2.0          (default 2.0)
  &listing_staleness_hours=48   (default 48)
  &days_of_supply=3             (default 3)
  &limit=50                     (default 50, max 200)
  &hq=false                     (default false)
```

Response:
```typescript
{
  opportunities: Opportunity[]
  meta: {
    scanCompletedAt: number           // unix ms
    itemsScanned: number
    itemsWithOpportunities: number
    nextScanEstimatedAt: number
  }
}
```

Output shape per opportunity:
```typescript
type Opportunity = {
  itemID: number
  itemName: string
  buyPrice: number
  sellPrice: number
  profitPerUnit: number
  tax: number
  sourceWorld: string
  sourceWorldID: number
  altSourceWorld?: string           // second-best source world
  altSourceWorldID?: number
  altExpectedDailyProfit?: number
  availableUnits: number
  recommendedUnits: number
  expectedDailyProfit: number
  score: number
  homeDataAgeHours: number
  sourceDataAgeHours: number
  homeConfidence: number
  sourceConfidence: number
  activeCompetitorCount: number
  fairShareVelocity: number
}
```

---

## Svelte Dashboard

### Layout

```
┌─────────────────────────────────────────────────────┐
│  StatusBar                                          │
│  Last scan: 43s ago · Next in: 42s · 847 opps found│
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  ThresholdControls (collapsible)                    │
│  [Price threshold ──●────] [Staleness ──────●──]   │
│  [Days of supply ───●───]  [HQ only ○] [Limit 50▾] │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  OpportunityTable                                   │
│  Item   Buy from   Buy  Sell  Profit  Units  /day   │
│  ─────────────────────────────────────────────────  │
│  ...    奧汀 🟢    312  890   533     3     8,400   │
│         [alt: 巴哈姆特 🔴 8,900/day]               │
└─────────────────────────────────────────────────────┘
```

### Components

**`App.svelte`** — owns all state: thresholds, opportunities, meta, loading, error. Polls `/api/opportunities` every 30s and on threshold change (debounced 500ms). No Svelte stores needed.

**`StatusBar.svelte`** — displays scan recency and opportunity count. Countdown ticks every second via local `setInterval`.

**`ThresholdControls.svelte`** — collapsible panel with sliders and toggles. Emits `change` events to `App.svelte`.

| Control | Type | Range | Default |
|---|---|---|---|
| Price threshold multiplier | Slider | 1.2× – 5.0× | 2.0× |
| Listing staleness cutoff | Slider | 1h – 168h | 48h |
| Days of supply cap | Slider | 1 – 14 days | 3 days |
| HQ only | Toggle | — | off |
| Result limit | Dropdown | 50 / 100 / 200 | 50 |

**`OpportunityTable.svelte`** — sorted by `score` descending. Each row expandable for full listing breakdown and sales history. Item name links to Universalis page.

**`StaleBadge.svelte`** — reusable staleness indicator driven by `confidence` value (0–1):

```
confidence ≥ 0.85  →  🟢  fresh
confidence ≥ 0.60  →  🟡  moderate
confidence ≥ 0.25  →  🟠  stale
confidence < 0.25  →  🔴  very stale
```

Using `confidence` rather than raw hours means the same component correctly renders asymmetric staleness: 3h-old home data shows 🟠 while 3h-old source data shows 🟢, because the server encodes risk asymmetry into the confidence values.

### Data Flow

```
App.svelte
  │  fetch /api/opportunities?{thresholds}  (30s poll + threshold change debounce)
  ├──▶ StatusBar.svelte         (meta prop)
  ├──▶ ThresholdControls.svelte (thresholds prop, emits change)
  └──▶ OpportunityTable.svelte  (opportunities prop)
            └──▶ StaleBadge.svelte (confidence prop)
```

Strictly top-down, no stores. Threshold changes always trigger a server re-score — the browser never holds the full dataset.

---

## Error Handling

### Scanner

| Scenario | Behaviour |
|---|---|
| 429 / 5xx from Universalis | Exponential backoff (1s → 2s → 4s), max 3 retries, skip batch, log warning |
| Network timeout | 10s per-request timeout, treated as retriable |
| Full scan phase fails | Cache retains previous data; `scanCompletedAt` does not update |
| `/api/v2/marketable` fails on startup | Retry every 30s; scanner does not begin until item list loaded |
| Item has no DC listings | Skip silently |
| Item has listings on home world only | Skip — no source world available |

### API

| Scenario | Response |
|---|---|
| Cache empty (cold start) | `202 Accepted` — `{ ready: false, message: "Scan in progress" }` |
| Invalid threshold params | `400 Bad Request` with field-level errors |
| Scoring throws unexpectedly | `500`, error logged server-side |

### Frontend

| Scenario | UI behaviour |
|---|---|
| 202 on cold start | Show "Initial scan in progress, results in ~25s" loading state |
| `scanCompletedAt` > 10min ago | Banner: "Data may be outdated — last scan Xmin ago" |
| `scanCompletedAt` > 30min ago | Warning banner (escalated colour) |

---

## Out of Scope (v1)

- Historical price trend tracking (SQLite deferred to v2)
- Multi-user support
- Cross-datacenter arbitrage (requires paid world transfer)
- Automatic retainer management or in-game integration
- Item category filtering
- Mobile layout optimisation
