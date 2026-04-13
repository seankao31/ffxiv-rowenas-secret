# Two-Pass Scoring for Vendor-Sell Opportunities

## Context

ENG-111 added NPC vendor sell price (`Item.PriceLow`) as an alternative sell destination in the arbitrage scanner. The scorer needed to evaluate vendor-sell alongside MB-sell for every item.

The existing MB-sell loop has 5+ early-exit `continue` statements (no home listings, zero velocity, no active listings, etc.). Vendor-sell bypasses most of these gates — it doesn't need home listings, velocity, competitors, or turnover discount.

## Decision

Vendor-sell runs as a **second pass** over the cache after the MB-sell loop, rather than restructuring the loop into a single-pass with conditional blocks.

The two scoring formulas operate on different scales:
- **MB-sell:** `profitPerUnit × fairShareVelocity × homeConf × sourceConf × turnoverDiscount` — the velocity and confidence multipliers amplify profitable, high-activity items
- **Vendor-sell:** `profitPerUnit × sourceConf` — no velocity, competition, or home-side factors (vendor sell is instant and guaranteed)

This means vendor-sell opportunities need significantly higher raw profit to rank alongside high-velocity MB items. This is intentional — MB-sell at 500 gil/unit with 5 sales/day IS more valuable than vendor-sell at 500 gil/unit for a single purchase.

## Reasoning

**Single-pass refactor rejected:** Would require converting all `continue` statements to nested `if` blocks or extracting the MB-sell evaluation into a separate function. Higher risk of regression, more code churn, for no behavioral benefit.

**Separate scoring formula (not unified):** A unified formula would need artificial velocity/competition values for vendor-sell (e.g., "infinite velocity"). This masks the real difference: vendor-sell is a one-shot guaranteed profit, not an ongoing income stream. Separate formulas make the semantics honest.

## Consequences

- The cache is iterated twice when `vendorSellPrices` is non-empty. This is trivially fast (in-memory Map iteration).
- The merge step uses an index map (`mbByItem`) to replace MB-sell with vendor-sell when vendor scores higher for the same item. Adding a third sell destination would need to extend this merge logic.
- Listing filtering logic (staleness, price threshold) is duplicated between the two passes. If filtering rules change, both passes need updating.
