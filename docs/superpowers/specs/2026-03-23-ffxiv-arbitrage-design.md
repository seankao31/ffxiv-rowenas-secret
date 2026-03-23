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
     ├── GET /api/opportunities   (scored, ranked results — includes scan meta)
     └── static /                 (Svelte build)
```

The scan loop is entirely I/O-bound (`await fetch(...)`) and never blocks the Node.js event loop. The frontend and API share the same origin, eliminating CORS configuration.

Note: no separate `/api/status` endpoint is needed. `StatusBar.svelte` is driven entirely by the `meta` field included in every `/api/opportunities` response. A `/api/status` route may be added later for health-check purposes (e.g., load balancer probes) but has no frontend consumer in v1.

---

## Data Flow & Scan Cycle

### Item List

At startup the scanner fetches all tradeable item IDs from:
```
GET https://universalis.app/api/v2/marketable
```
This is **never hardcoded** — new items added in FFXIV patches are automatically included. Infrastructure is sized for 20,000 items (above the ~16,000 currently tradeable as of early 2026).

### Item Names

Item names are **not** returned by `/api/v2/marketable` (IDs only). They must be resolved from a separate source. Strategy: fetch names in bulk at startup using the Universalis extra content endpoint or xivapi, and cache them in a `Map<number, string>` (itemID → name) in memory alongside the item ID list. The exact bulk-name endpoint to use should be determined during implementation (candidate: `GET /api/v2/extra/content/item/{itemId}` per-item, or a bulk game data source). Names are only needed when constructing `Opportunity` objects for the API response — they are not required during the scan itself.

### Two-Phase Scan

Each scan cycle runs two sequential phases, each batching items 100 at a time.

**Phase 1 — DC-level query**
```
GET /api/v2/陸行鳥/{itemIds}
```
Returns listings from all 8 worlds in the DC, each tagged with `worldID`/`worldName`. Extracted data:
- All listings with `pricePerUnit`, `quantity`, `worldID`, `lastReviewTime`, `hq`
- Item-level `lastUploadTime` (most recent across the DC — used as fallback; see Cache Shape)

**Phase 2 — Home world query**
```
GET /api/v2/利維坦/{itemIds}
```
Returns 利維坦-specific data. Extracted data:
- `regularSaleVelocity` — units sold per day on 利維坦 (DC-level velocity would overestimate)
- `recentHistory` — recent actual sales
- Item-level `lastUploadTime` for home world — used as the authoritative `homeLastUploadTime`

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

Cold start: first results appear ~25 seconds after process startup.

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
  // Per-world data freshness. Derived from Phase 1: max(lastReviewTime) per worldID
  // across all listings for that world. When no Phase 1 listings exist for a world,
  // that world has no entry in this map.
  worldUploadTimes: Record<number, number>  // worldID → unix ms

  // Authoritative home-world freshness from Phase 2 item-level lastUploadTime.
  // Falls back to worldUploadTimes[4030] (derived from Phase 1 listings) only if
  // Phase 2 does not return a value. This fallback matters for items whose home
  // board is empty (sold out) — a valuable signal meaning demand exists but supply
  // is gone.
  homeLastUploadTime: number

  listings: Listing[]           // all worlds in DC (from Phase 1)
  regularSaleVelocity: number   // 利維坦-specific, HQ + NQ combined (from Phase 2)
  hqSaleVelocity: number        // 利維坦-specific, HQ only — used when hq=true (from Phase 2)
  recentHistory: SaleRecord[]   // 利維坦-specific (from Phase 2)
}

const cache = new Map<number, ItemData>()  // itemID → ItemData
```

**Per-world staleness derivation:** The Universalis DC-level response does not provide per-world upload timestamps directly. They are derived as:
```
worldUploadTimes[worldID] = max(lastReviewTime of all listings on that world for this item)
```
This is a well-grounded approximation: Universalis uploaders scan the full market board when uploading, so the newest listing timestamp reliably reflects the last full board scan on that world.

---

## Scoring Pipeline

Scoring runs **on every API request** — not during the scan. The full raw cache is scored with the caller's threshold parameters and the top-N results returned. Scoring 20,000 items with up to 7 source worlds each (140,000 world-score computations) is pure arithmetic and completes in milliseconds.

### Step 1 — Resolve Active Listings

```
home_listings   = listings where worldID == 4030
source_listings = listings where worldID != 4030

active_home_listings = home_listings where:
  pricePerUnit <= min(home_listings.pricePerUnit) × price_threshold_multiplier
  AND lastReviewTime >= now - (listing_staleness_hours × 3_600_000)

// If active_home_listings is empty: skip this item entirely.
// There is no valid home sell price to anchor the opportunity.

cheapest_home_price      = min(active_home_listings.pricePerUnit)
active_competitor_count  = count(active_home_listings)

// Per source world:
active_source_listings[world] = source_listings for that world where:
  pricePerUnit <= min(source_listings[world].pricePerUnit) × price_threshold_multiplier
  AND lastReviewTime >= now - (listing_staleness_hours × 3_600_000)
```

### Step 2 — Per-World Source Scoring

The recommended source world is the one with the **highest confidence-adjusted score** — not necessarily the cheapest. The alt world is the source world with the highest **raw `profit_per_unit`** excluding the recommended world — deliberately the potentially-cheaper-but-stalier alternative, so the user can judge the risk tradeoff.

```
MARKET_TAX = 0.05

for each source_world (excluding 利維坦):
  if active_source_listings[world] is empty: skip world

  cheapest_source = min(active_source_listings[world].pricePerUnit)
  profit_per_unit = cheapest_home_price × (1 - TAX) - cheapest_source
  if profit_per_unit <= 0: skip world

  source_age_hours      = (now - worldUploadTimes[world]) / 3_600_000
  source_confidence     = exp(-source_age_hours / 12)
  world_score           = profit_per_unit × fair_share_velocity × home_confidence × source_confidence

best_source_world = world with max world_score           // confidence-adjusted best
alt_source_world  = world with max raw profit_per_unit,
                    excluding best_source_world          // cheapest alternative regardless of staleness

// If fewer than 2 profitable source worlds exist, altSourceWorld is omitted.
```

### Step 3 — Shared Components

```
fair_share_velocity = regularSaleVelocity / (active_competitor_count + 1)
  where active_competitor_count = count(active_home_listings)

// If fair_share_velocity == 0 (item never sells on home world): score = 0, item excluded.

home_age_hours    = (now - homeLastUploadTime) / 3_600_000
home_confidence   = exp(-home_age_hours / 3)    ← steep: 3h half-life (financial risk)
source_confidence = exp(-source_age_hours / 12) ← gentle: 12h half-life (trip risk only)

// available_units_on_best_source = cumulative quantity of all active source listings
// at exactly the cheapest_source price on best_source_world (not the full active range).
// Multiple retainers at the same minimum price all count toward purchasable supply.
max_units        = ceil(fair_share_velocity × days_of_supply_cap)
effective_units  = min(available_units_on_best_source, max_units)
// effective_units is exposed as recommendedUnits in the Opportunity output.

expected_daily_profit     = profit_per_unit × fair_share_velocity
// Raw economic value in gil/day — shown to user. No confidence weighting.

alt_expected_daily_profit = alt_profit_per_unit × fair_share_velocity
// fair_share_velocity is shared (it depends on home competition, not source world).
// alt_profit_per_unit = cheapest_home_price × (1 - TAX) - alt_world_cheapest_source_price.
// Exposed as altExpectedDailyProfit in the Opportunity output.

score = profit_per_unit × fair_share_velocity × home_confidence × source_confidence
// Unit: approximately gil/day discounted by confidence. Used for ranking only — not
// displayed as a gil amount, since showing confidence-adjusted values as money is
// misleading (e.g. "512 gil/day" when the real rate is 1,000 gil/day but data is stale).
```

### Staleness Asymmetry

Risk is asymmetric by direction:

| Stale data | Consequence | Reversible? |
|---|---|---|
| Source world price (buy side) | Travel there, see real price, choose not to buy | ✅ Yes — wasted trip only |
| Home world price (sell side) | Already bought items; arrive home to crashed market | ❌ No — money committed |

Hence the steeper home confidence decay (3h half-life vs. 12h for source). Stale data is never excluded entirely — it retains heuristic value and is visually flagged instead.

### HQ Filter

When `hq=true`:
- Only `Listing` entries where `hq == true` are included in both `active_home_listings` and `active_source_listings`.
- Only `SaleRecord` entries where `hq == true` contribute to the velocity calculation. Note: `regularSaleVelocity` is pre-aggregated by Universalis (HQ + NQ combined). When `hq=true`, use `hqSaleVelocity` from the home world response instead of `regularSaleVelocity`.
- HQ and NQ listings are never mixed in a single scoring pass.

### API Endpoint

```
GET /api/opportunities
  ?price_threshold=2.0            (default 2.0)
  &listing_staleness_hours=48     (default 48)
  &days_of_supply=3               (default 3)
  &limit=50                       (default 50, max 200)
  &hq=false                       (default false)
```

All threshold parameters use `listing_staleness_hours` as the canonical name throughout the codebase (API query param, scoring function parameter, and UI label).

Response:
```typescript
{
  opportunities: Opportunity[]
  meta: {
    scanCompletedAt: number           // unix ms of last completed scan
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
  itemName: string                  // resolved from name cache at response time

  // Pricing
  buyPrice: number                  // cheapest active source price (best_source_world)
  sellPrice: number                 // cheapest active home price
  profitPerUnit: number             // after tax
  tax: number                       // gil amount withheld (sellPrice × 0.05)

  // Recommended source
  sourceWorld: string
  sourceWorldID: number

  // Alt source (highest raw profit_per_unit, excluding recommended world)
  // Omitted if fewer than 2 profitable source worlds exist.
  altSourceWorld?: string
  altSourceWorldID?: number
  altBuyPrice?: number
  altExpectedDailyProfit?: number
  altSourceConfidence?: number      // for StaleBadge rendering
  altSourceDataAgeHours?: number    // for display

  // Volume
  availableUnits: number            // at cheapest source price on sourceWorld
  recommendedUnits: number          // effective_units = min(availableUnits, max_units)
  expectedDailyProfit: number       // profit_per_unit × fair_share_velocity (gil/day, no confidence)

  // Ranking
  score: number                     // confidence-weighted; used for sort only, not displayed

  // Home staleness
  homeDataAgeHours: number
  homeConfidence: number            // drives StaleBadge colour

  // Source staleness (recommended world)
  sourceDataAgeHours: number
  sourceConfidence: number          // drives StaleBadge colour

  // Competition
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

**`App.svelte`** — owns all state: thresholds, opportunities, meta, loading, error. Polls `/api/opportunities` every 30s and on threshold change (debounced 500ms). No Svelte stores needed — `App.svelte` is small enough to own all state directly.

Keeping threshold state in `App.svelte` and always re-fetching from the server (rather than re-filtering client-side) means the browser never holds the full 20,000-item dataset. The server does all filtering and scoring; the client holds only the Top-N result.

**`StatusBar.svelte`** — props: `meta: ScanMeta`. Displays scan recency and opportunity count. Countdown ticks every second via a local `setInterval` independent of the data polling interval.

**`ThresholdControls.svelte`** — collapsible panel. Emits `change` events to `App.svelte` on any input.

| Control | Type | Range | Default |
|---|---|---|---|
| Price threshold multiplier | Slider | 1.2× – 5.0× | 2.0× |
| Listing staleness hours | Slider | 1h – 168h | 48h |
| Days of supply cap | Slider | 1 – 14 days | 3 days |
| HQ only | Toggle | — | off |
| Result limit | Dropdown | 50 / 100 / 200 | 50 |

**`OpportunityTable.svelte`** — props: `opportunities: Opportunity[]`. Sorted by `score` descending. Each row is expandable to show the full listing breakdown and sales history. Item name links to the Universalis page for that item.

**`StaleBadge.svelte`** — props: `confidence: number`, `ageHours: number`. Reusable staleness indicator:

```
confidence ≥ 0.85  →  🟢  "{ageHours}h ago" (or "Xmin ago" if < 1h)
confidence ≥ 0.60  →  🟡
confidence ≥ 0.25  →  🟠
confidence < 0.25  →  🔴
```

Driven by `confidence` (0–1) rather than raw hours so the same component correctly handles asymmetric staleness: 3h-old home data shows 🟠 while 3h-old source data shows 🟢, because the server already encodes the risk asymmetry into the confidence values.

### Data Flow

```
App.svelte
  │  fetch /api/opportunities?{thresholds}  (30s poll + threshold change debounced 500ms)
  ├──▶ StatusBar.svelte         (meta prop)
  ├──▶ ThresholdControls.svelte (thresholds prop, emits change)
  └──▶ OpportunityTable.svelte  (opportunities prop)
            └──▶ StaleBadge.svelte (confidence + ageHours props)
```

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
| `active_home_listings` is empty after filtering | Skip item entirely — no valid home sell price |
| `fair_share_velocity` is zero | Score = 0; item excluded — no point buying what never sells |

### API

| Scenario | Response |
|---|---|
| Cache empty (cold start, ~25s) | `202 Accepted` — `{ ready: false, message: "Scan in progress" }` |
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
