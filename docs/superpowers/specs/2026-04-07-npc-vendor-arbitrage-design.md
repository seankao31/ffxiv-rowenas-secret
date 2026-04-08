# NPC Vendor Price Arbitrage — Design Spec

**Date:** 2026-04-07
**Linear:** ENG-56
**Status:** Draft

## Problem

The arbitrage page only considers cross-world market board listings as buy sources. Items sold by NPC vendors for gil are sometimes cheaper than any market board listing, representing zero-risk arbitrage opportunities that the dashboard currently misses.

## Solution

Add NPC vendor prices as a competing buy source in the arbitrage scoring model. NPC is treated as a "virtual world" alongside the 7 non-home worlds in the data center, competing for best/alt source position using the same ranking logic.

## Data Fetching (Server Startup)

New module: `src/lib/server/vendors.ts`

At server startup, paginate XIVAPI v2's `GilShopItem` sheet to build a `Map<number, number>` mapping `itemId → vendorPrice` (from `Item.PriceMid`). This is ~6,700 items across ~33 pages at 500 rows/page, yielding ~1,400 items with a positive vendor price. A blocklist of 38 known false positives (housing permits, removed items) is applied during collection.

- Fetch runs in `hooks.server.ts` alongside (or before) the scanner start
- Vendor price map stored in the cache module, passed to `scoreOpportunities()`
- **Graceful degradation:** If XIVAPI is down, vendor map is empty — app behaves exactly as today (cross-world only). No crash, no retry loop.

## Scoring Integration

In `scoreOpportunities()`, after evaluating all cross-world sources for an item, check if the item exists in the vendor price map. If so, create an NPC "world result" with special properties:

| Property | NPC value | Cross-world value |
|----------|-----------|-------------------|
| Buy tax | 0% | 5% |
| Source confidence | 1.0 (100%) | `exp(-ageHours / 12)` |
| Data age | 0 hours | Varies |
| Available units | Unlimited | Count at cheapest price |

**Profit calculation:**
```
profitPerUnit = realisticSellPrice × 0.95 - vendorPrice
```
(No `× 1.05` multiplier on buy price — NPC purchases are tax-free.)

**Score:**
```
score = profitPerUnit × fairShareVelocity × homeConf × 1.0 × turnoverDiscount
```

NPC competes with cross-world sources for best/alt position:
- **Best source:** Highest score across all worlds + NPC
- **Alt source:** Highest raw profitPerUnit among remaining (excluding best)

When NPC wins: `sourceWorld = "NPC"`, `sourceWorldID = 0` (sentinel value).

**Natural exclusions:**
- Items not in the vendor map → unchanged behavior
- NPC price yields no profit → NPC excluded (existing `profitPerUnit > 0` filter)
- Items not marketable on MB → not in Universalis data → no home sell price → excluded
- Vendor map empty (XIVAPI down) → all behavior unchanged

**Recommended units with unlimited supply:**
When source is NPC, `availableUnits` is uncapped, so `recommendedUnits = ceil(fairShareVelocity × daysOfSupply)` (no `min(availableUnits, ...)` cap).

## Opportunity Type Changes

Minimal changes to the `Opportunity` type. NPC sources use sentinel values in existing fields:

- `sourceWorld: "NPC"` / `altSourceWorld: "NPC"`
- `sourceWorldID: 0` / `altSourceWorldID: 0`
- `sourceConfidence: 1.0` / `altSourceConfidence: 1.0`
- `sourceDataAgeHours: 0` / `altSourceDataAgeHours: 0`

No new boolean flags needed — check `sourceWorld === "NPC"` in the frontend.

## Frontend Display

### "Buy from" column
- `sourceWorld === "NPC"`: Render an "NPC" badge/label, visually distinct from world names
- Same treatment for alt source line when `altSourceWorld === "NPC"`

### Buy price column
- Works as-is — displays the vendor price
- Confidence indicator: always green (100%)
- Data age: display "NPC" instead of a time-ago string

### Units column
- When source is NPC: show only `recommendedUnits` (no `/ availableUnits` denominator), or display "∞" for available

### Vendor metadata popover
- Clicking/hovering the "NPC" label opens a popover listing all NPCs that sell this item
- Each entry: NPC name + zone (e.g., "Junkmonger — Limsa Lominsa Lower Decks")
- Multiple NPCs per item is common — the popover shows a scrollable list
- Data fetched lazily on the client side, similar to existing icon/name lazy-fetching in `xivapi.ts`
- **Data source for metadata:** To be determined during implementation (XIVAPI sheet traversal or Garland Tools per-item API). Since metadata is only needed for ~50 items in current results, per-item fetching is acceptable.

## Testing Strategy

TDD throughout — tests before implementation at each layer.

### Server-side tests
- `vendors.ts`: XIVAPI pagination logic, building vendor price map, handling empty/error responses
- `scoring.ts`:
  1. NPC price beats all cross-world sources → NPC is primary source
  2. Cross-world source beats NPC → NPC is alt (or absent)
  3. NPC price yields no profit → NPC excluded entirely
  4. Item not in vendor map → behavior unchanged
  5. Vendor map empty → all behavior unchanged
  6. Profit calculation verifies 0% buy tax (vs 5% for MB)
- Cache integration: vendor map stored and retrievable

### Client-side tests
- OpportunityTable: "NPC" label rendering, unlimited units display
- Vendor metadata: lazy fetching, caching, multiple NPCs per item
- Popover: renders NPC list correctly

## Out of Scope

- NPC unlock conditions (quest/achievement requirements) — future enhancement
- NPC map coordinates / minimap integration — future enhancement
- Currency/token shop vendors (non-gil) — different feature entirely
