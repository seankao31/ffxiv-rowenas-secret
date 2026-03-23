# ADR-004: Opportunity Scoring Formula

**Status:** Accepted
**Date:** 2026-03-23

## Context

Arbitrage opportunities need to be ranked so the dashboard can surface the most actionable ones. Several approaches to scoring were discussed.

## Core Metric: Expected Daily Profit

The fundamental scoring metric is **expected daily profit** — not raw margin % nor absolute profit per unit in isolation.

**Rationale:** An item with 100 gil profit that sells 100 times per day (10,000 gil/day) is equivalent to an item with 10,000 gil profit that sells once per day (10,000 gil/day). A metric that captures both dimensions avoids over-ranking high-margin-but-slow items or high-velocity-but-low-margin items.

### Alternatives Considered

- **Margin % only** — overvalues cheap items with huge % gains but tiny absolute profit.
- **Absolute profit per unit only** — overvalues expensive slow-moving items that tie up capital.
- **Expected daily profit** *(chosen)* — naturally balances both dimensions.

## Formula

Scoring is computed **per source world**, and the best-scoring world is selected as the recommendation. This is a key distinction from naively picking the cheapest source world — see the Multi-World Scoring section below.

```
for each source_world in DC (excluding home):
  profit_per_unit = cheapest_home_price × (1 - TAX) - cheapest_source_price[world]
  if profit_per_unit <= 0: skip world

  source_confidence = exp(-world_data_age_hours[world] / 12)
  world_score = profit_per_unit × fair_share_velocity × home_confidence × source_confidence

item_score        = max(world_score across all source worlds)
best_source_world = world that produced item_score
```

### Components

**`profit_per_unit`** (per source world)
```
= cheapest_active_price_on_home_world × (1 - MARKET_TAX)
- cheapest_active_price_on_source_world
```
`MARKET_TAX = 0.05` (5% of sale price, standard TC server rate)

**`fair_share_velocity`**
```
= regularSaleVelocity / (active_competitor_count + 1)
```
Reflects your realistic share of daily demand given existing competition on the home world.
`regularSaleVelocity` is fetched from a home-world-specific query (not DC-level), to avoid inflating the estimate with demand from other worlds.

**`home_confidence`** — steep staleness decay (high-stakes: financial loss risk)
```
= exp(-home_data_age_hours / 3)    ← halves every 3 hours
```

**`source_confidence`** — gentle staleness decay per world (low-stakes: wasted trip risk only)
```
= exp(-world_data_age_hours[world] / 12)  ← halves every 12 hours
```

## Multi-World Source Scoring

### Problem

The 陸行鳥 DC has 8 worlds. Naively picking the cheapest source world ignores per-world staleness:

- **巴哈姆特**: cheapest price, data 18 hours old → low confidence
- **奧汀**: 50 gil more expensive, data 20 minutes old → high confidence

Recommending 巴哈姆特 could send the user on a trip to find the price has already changed. 奧汀 may be the smarter trip despite costing slightly more.

### Solution

Score every source world independently. The recommended world is the one with the highest confidence-adjusted score, not the lowest raw price.

### Alternatives Considered

- **Pick cheapest source world** — rejected: ignores per-world staleness, may recommend stale data.
- **Blend/average across worlds** — rejected: doesn't make practical sense for arbitrage. The user travels to exactly one world per trip; a blend has no actionable meaning.
- **Per-world independent scoring** *(chosen)* — the recommended world maximizes expected value accounting for both profit and data confidence.

### Per-World Data Age Derivation

The Universalis DC-level response does not provide per-world upload timestamps directly — only a single `lastUploadTime` reflecting the most recent upload across the entire DC.

Per-world staleness is therefore **derived** from listing-level data:
```
world_upload_time[worldID] = max(lastReviewTime of all listings on that world for this item)
```

`lastReviewTime` is a per-listing field representing when that specific retainer listing was last seen during a Universalis upload. The most recent `lastReviewTime` across all listings on a given world is a strong proxy for when that world's market data was last refreshed.

This derivation is an approximation, but a well-grounded one: Universalis uploaders scan the full market board when they upload, so the newest listing timestamp reliably reflects the last full board scan on that world.

### UI: Surfacing Alternatives

The dashboard surfaces both the recommended source world and the top alternative, so the user can make a final judgment:

| Item | Buy from | Price | Data age | Profit/day | Alt. world |
|---|---|---|---|---|---|
| Darksteel Ore | 奧汀 | 312 | 18min | 8,400/day | 巴哈姆特 (22h old, 8,900/day) |

This lets the user decide: "the stale world has a technically better deal — is it worth the risk?"

## Staleness Asymmetry

A key design insight: staleness risk is **asymmetric by direction**.

| Stale data | Consequence | Reversible? |
|---|---|---|
| Source world price (buy side) | Travel there, see real price in-person, choose not to buy | ✅ Yes — wasted trip only |
| Home world price (sell side) | Already bought items on another server; arrive home to a crashed market | ❌ No — money already committed |

Therefore home-side staleness carries a steeper penalty (3-hour half-life) versus source-side staleness (12-hour half-life).

Stale data is **never excluded entirely** — it retains heuristic value. Instead it is discounted by the confidence multiplier and visually flagged on the dashboard.

## Active Competitor Count

Raw listing count overstates competition. A listing is only counted as "active competition" if:
1. `pricePerUnit <= cheapest_price × price_threshold_multiplier` (not a price-gouging outlier)
2. `lastReviewTime >= now - listing_staleness_cutoff` (seller has been recently active)

Players who set prices and never update them ("dead retainers") are excluded from the competitor count.

Note: `lastReviewTime` is a **per-listing** field in the Universalis API, distinct from the per-item `lastUploadTime`.

## Unit Cap (Overbuy Protection)

TC server (陸行鳥) competition is intense; prices can collapse quickly. To avoid overbuying:

```
max_units_to_buy = ceil(fair_share_velocity × days_of_supply_cap)
effective_units  = min(available_units_on_source_world, max_units_to_buy)
```

Where `days_of_supply_cap` is user-configurable (default: 3 days).

### Alternatives Considered

- **Fixed cap (e.g., max 5 units)** — rejected: not proportionate to demand. A cap of 5 on a 100/day item sells out in hours; on a 1/day item it's 5 days of stuck inventory.
- **Velocity-proportionate cap** *(chosen)* — scales naturally with how fast the item actually moves.

## Configurable Thresholds

All threshold parameters are user-configurable via the dashboard UI and passed as query parameters to the scoring endpoint:

| Parameter | Default | Effect |
|---|---|---|
| `price_threshold_multiplier` | 2.0× | Listings above 2× cheapest are excluded as dead |
| `listing_staleness_hours` | 48h | Listings older than this are excluded as inactive |
| `days_of_supply_cap` | 3 days | Max units to buy per item per trip |

Because thresholds affect which listings count as active competition, the backend must store **full raw scan data** in memory (not just a pre-scored Top-N). Scoring is computed dynamically per API request with the given threshold parameters.

## Cache Shape Implication

Multi-world scoring requires per-world upload times, not a single top-level `lastUploadTime`. The `ItemData` cache type stores:

```typescript
type ItemData = {
  itemID: number
  worldUploadTimes: Record<number, number>  // worldID → unix ms (derived from max lastReviewTime per world)
  homeLastUploadTime: number                // authoritative from Phase 2 item-level lastUploadTime;
                                            // falls back to worldUploadTimes[4030] if Phase 2 has no value
                                            // (important for sold-out home boards)
  listings: Listing[]                       // all worlds in DC
  regularSaleVelocity: number              // 利維坦-specific (from home world query)
  recentHistory: SaleRecord[]              // 利維坦-specific
}
```

## Consequences

- Scoring evaluates up to 7 source worlds per item. At 20,000 items this is 140,000 world-score computations per API request — still completes in milliseconds (pure arithmetic, no I/O).
- The dashboard UI needs controls (sliders/inputs) for the configurable thresholds.
- The recommended source world is the confidence-adjusted best, not the cheapest. The raw cheapest is surfaced as the "alt world" column for user reference.
- Future improvement: weight `home_confidence` decay rate differently per item category (e.g., consumables reprice faster than housing items).
