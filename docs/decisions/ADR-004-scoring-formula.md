# ADR-004: Opportunity Scoring Formula

**Status:** Accepted
**Date:** 2026-03-23
**Updated:** 2026-03-24 — realistic sell price, competitor recount, turnover discount
**Updated:** 2026-04-15 — removed listing_staleness_hours, simplified competitor counting (ENG-146)

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
  profit_per_unit = realistic_sell_price × (1 - TAX) - cheapest_listing_price[world]
  if profit_per_unit <= 0: skip world

  source_confidence = exp(-world_data_age_hours[world] / 12)
  world_score = profit_per_unit × fair_share_velocity
              × home_confidence × source_confidence
              × turnover_discount

item_score        = max(world_score across all source worlds)
best_source_world = world that produced item_score
```

### Components

**`realistic_sell_price`** — what buyers actually pay, not just what sellers ask
```
= min(cheapest_active_listing, median_recent_sale_price)
```
See [Realistic Sell Price](#realistic-sell-price) section below.

**`profit_per_unit`** (per source world)
```
= realistic_sell_price × (1 - MARKET_TAX)
- cheapest_listing_price_on_source_world
```
`MARKET_TAX = 0.05` (5% of sale price, standard TC server rate)

**`fair_share_velocity`**
```
= regularSaleVelocity / (active_competitor_count + 1)
```
Reflects your realistic share of daily demand given existing competition on the home world.
`regularSaleVelocity` is fetched from a home-world-specific query (not DC-level), to avoid inflating the estimate with demand from other worlds.

See [Active Competitor Count](#active-competitor-count) for how competitors are counted relative to `realistic_sell_price`.

**`home_confidence`** — steep staleness decay (high-stakes: financial loss risk)
```
= exp(-home_data_age_hours / 3)    ← halves every 3 hours
```

**`source_confidence`** — gentle staleness decay per world (low-stakes: wasted trip risk only)
```
= exp(-world_data_age_hours[world] / 12)  ← halves every 12 hours
```

**`turnover_discount`** — liquidity risk penalty for slow-selling items
```
= exp(-max(0, days_to_sell - 1) / 3)
```
See [Turnover Discount](#turnover-discount) section below.

## Realistic Sell Price

### Problem

The original formula used `cheapest_active_listing` on the home world as the expected sell price. This is accurate for liquid items where listings sell near asking price. But for **slow-moving items**, the cheapest listing can sit at an inflated price indefinitely — nobody is buying at that price. Using it overestimates profit.

**Example:** Item has 1 listing at 200K, but the last 5 actual sales were around 50K. The listing price reflects seller aspiration, not buyer willingness to pay.

### Solution

Cap the expected sell price at the **median of recent sales**:

```
realistic_sell_price = min(cheapest_active_listing, median_recent_sale_price)
```

This is a one-sided cap: if listings are *cheaper* than historical sales, the listing price is the better estimate (market moved down, you'd undercut that). We only override when listings are *above* historical sales, signalling inflated asking prices.

**Why median over mean:** Median is robust to outliers. A single panic sale at 1 gil or a lucky sale at 10M won't distort it. For thin markets with few sales, this matters most.

### History Window

All available sale history from the Universalis API is used — no time-window filter is applied.

The API already returns a bounded set of recent sales (~20 entries), which provides natural recency bias: for fast-moving items those entries span hours; for slow-moving items they span weeks or months.

**Why no adaptive window:** An earlier design used a velocity-based time window (`clamp(TARGET_SALES / velocity, 1, 30)` days) to filter for "fresh" data. This was removed because the tight window for medium-to-high velocity items could exclude recent sales that fell just outside the cutoff, causing the system to fall back to the listing price — exactly the failure mode the realistic sell price was designed to prevent.

Low-velocity items with stale or absent history are not a concern: their low velocity already suppresses their score via `fair_share_velocity` and the turnover discount. The listing-price fallback only activates for items with genuinely no sale history, which by definition have near-zero velocity and won't surface in rankings.

### UI Impact

The dashboard displays `realistic_sell_price` as the sell price. A separate `listingPrice` field preserves the raw cheapest listing. When the two differ, the expand row shows: "Listing: 200,000 (sell est. capped by sale history)".

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

The Universalis DC-level response provides a `worldUploadTimes` field mapping each world to the timestamp of the last market data upload for that item. In per-world scan mode (the current default), this is synthesized from each world endpoint's `lastUploadTime`.

Note: prior to Dawntrail (7.0), `lastReviewTime` was a per-listing field representing when each retainer listing was individually reviewed. Post-7.0, Square Enix removed the underlying packet field. Both Dalamud and Teamcraft now send placeholder values, and Universalis falls back to `DateTime.UtcNow`. As a result, `lastReviewTime` equals the per-world upload time for all listings on that world — it is no longer a per-listing signal.

### UI: Surfacing Alternatives

The dashboard surfaces both the recommended source world and the top alternative, so the user can make a final judgment:

| Item | Buy from | Price | Data age | Profit/day | Alt. world |
|---|---|---|---|---|---|
| Darksteel Ore | 奧汀 | 312 | 18min | 8,400/day | 巴哈姆特 (22h old, 8,900/day) |

This lets the user decide: "the stale world has a technically better deal — is it worth the risk?"

## Staleness Asymmetry

Staleness risk is **asymmetric by direction**.

| Stale data | Consequence | Reversible? |
|---|---|---|
| Source world price (buy side) | Travel there, see real price in-person, choose not to buy | Yes — wasted trip only |
| Home world price (sell side) | Already bought items on another server; arrive home to a crashed market | No — money already committed |

Therefore home-side staleness carries a steeper penalty (3-hour τ) versus source-side staleness (12-hour τ).

Stale data is never excluded entirely — it retains heuristic value. Confidence decay (`exp(-age/τ)`) smoothly discounts stale opportunities rather than hard-cutting them. This avoids penalizing items on worlds with low uploader coverage, where prices may be valid but simply haven't been re-uploaded recently.

## Competitor Count

Competitors are all home-world listings priced near the expected sell point:

```
competitor_listings = home_listings where price <= realistic_sell_price × price_threshold
active_competitor_count = count(competitor_listings)
```

Listings far above the expected sell price are excluded — a 200K listing is not competing with a 50K seller. The `price_threshold` multiplier (default 2.0×) controls how wide this radius is.

**Why:** If the cheapest listing is 200K but we plan to sell at 50K (based on sale history), the 200K seller is not real competition — buyers at the 50K price point won't comparison-shop at 200K. Only listings near *our* expected price compete for the same buyers.

**Effect:** When `realistic_sell_price` drops below listing prices, high-priced listings fall out of the competitor count, increasing `fair_share_velocity`. This matches economic intuition: if you're the cheapest seller by a wide margin, you capture most of the demand.

**Edge case:** If all home listings are above `realistic_sell_price × price_threshold`, competitor count = 0 and `fair_share_velocity = velocity / 1 = velocity` (full market demand). This is correct — there are no real competitors at your price point.

## Turnover Discount

### Problem

The base score (`profit × velocity`) already favours fast-moving items linearly. But it doesn't capture the **compounding risk** of slow turnover: capital locked up in unsold inventory, exposure to price undercutting while waiting, and market shifts during the holding period. A 200K profit item that takes 2 weeks to sell ties up capital that could fund dozens of fast trades.

### Solution

Apply an exponential **liquidity discount** based on expected time to sell one unit:

```
days_to_sell      = 1 / fair_share_velocity
turnover_discount = exp(-max(0, days_to_sell - IDEAL_DAYS) / τ)

IDEAL_DAYS = 1    ← items selling in ≤1 day get no penalty
τ          = 3    ← controls decay steepness
```

| Days to sell | Discount | Interpretation |
|---|---|---|
| ≤ 1 | 100% | Ideal — no penalty |
| 2 | 72% | Slightly less attractive |
| 3 | 51% | Edge of comfort — half score |
| 5 | 26% | Reluctant territory |
| 7 | 14% | Strongly discouraged |
| 14 | 1.3% | Effectively eliminated from rankings |

### Design Choices

**Why exponential decay (again)?** Same pattern as confidence factors: each additional day of exposure adds the same *proportional* risk. This keeps the score formula consistent — all risk dimensions use `exp(-x/τ)`.

**Why only affect score, not `expectedDailyProfit`?** The daily profit figure is the theoretical return if assumptions hold. The score is the *risk-adjusted* ranking. Keeping them separate lets the user see the raw economics and understand why a high-profit item ranks low (slow turnover penalised it).

**Why `- 1` offset?** The user's preference: selling in 1 day is ideal, 3 days is the acceptable maximum. Without the offset, even 1-day items would be penalised (exp(-1/3) ≈ 0.72). The offset creates a "free zone" for fast-moving items.

### Full Score Formula Summary

```
score = profit_per_unit
      × fair_share_velocity
      × home_confidence          exp(-home_age / 3)
      × source_confidence        exp(-source_age / 12)
      × turnover_discount        exp(-max(0, 1/velocity - 1) / 3)
```

Each multiplicative factor is a probability-like number in (0, 1] representing a distinct risk dimension:
- **home_confidence**: is the sell price still accurate?
- **source_confidence**: is the buy price still accurate?
- **turnover_discount**: will I sell before the market shifts?

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
| `price_threshold_multiplier` | 2.0× | Competitor radius: listings above this × realistic sell price are not counted as competition |
| `days_of_supply_cap` | 3 days | Max units to buy per item per trip |

Because thresholds affect which listings count as active competition, the backend must store **full raw scan data** in memory (not just a pre-scored Top-N). Scoring is computed dynamically per API request with the given threshold parameters.

## Cache Shape Implication

Multi-world scoring requires per-world upload times, not a single top-level `lastUploadTime`. The `ItemData` cache type stores:

```typescript
type ItemData = {
  itemID: number
  worldUploadTimes: Record<number, number>  // worldID → unix ms
  homeLastUploadTime: number                // authoritative from Phase 2 item-level lastUploadTime;
                                            // falls back to worldUploadTimes[4030] if Phase 2 has no value
                                            // (important for sold-out home boards)
  listings: Listing[]                       // all worlds in DC
  regularSaleVelocity: number              // 利維坦-specific, HQ + NQ combined (from home world query)
  hqSaleVelocity: number                   // 利維坦-specific, HQ only — used when hq=true (from Phase 2)
  recentHistory: SaleRecord[]              // 利維坦-specific
}
```

## Consequences

- Scoring evaluates up to 7 source worlds per item. At 20,000 items this is 140,000 world-score computations per API request — still completes in milliseconds (pure arithmetic, no I/O).
- The dashboard UI needs controls (sliders/inputs) for the configurable thresholds.
- The recommended source world is the confidence-adjusted best, not the cheapest. The raw cheapest is surfaced as the "alt world" column for user reference.
- Slow-moving items with inflated listings are naturally deprioritised by three reinforcing mechanisms: sell price capped by history, competitor count reduced (increasing velocity share), and turnover discount penalising the remaining long wait time.
- Future improvement: weight `home_confidence` decay rate differently per item category (e.g., consumables reprice faster than housing items).
