# Vendor Sell Floor — Design Spec

**Ticket:** ENG-111
**Date:** 2026-04-13

## Problem

The arbitrage scanner buys from cross-world market boards and sells to the home-world market board. Every item with a non-zero `Item.PriceLow` (vendor sell price) can be sold to any NPC for guaranteed profit — no competition, no MB listing risk. If a cross-world (or home-world) listing is below that vendor sell price minus buy tax, the player can buy and immediately vendor for risk-free profit.

This is distinct from ENG-56 (NPC as a buy source via `GilShopItem` / `PriceMid`). This issue uses `PriceLow` (player → NPC) as a sell destination.

## Design

### Data Pipeline

1. At startup, fetch marketable item IDs from Universalis `/marketable` (same endpoint the scanner uses).
2. Batch-fetch `PriceLow` from XIVAPI Item sheet for those IDs, using the same batching pattern as `fetchItemPrices` in `vendors.ts`.
3. Store as `vendorSellPrices: Map<itemID, number>` in the cache, separate from the existing `vendorPrices` (NPC buy source / PriceMid).
4. Pass to `scoreOpportunities` alongside existing `vendorPrices`.

The scanner independently fetches marketable items again when it starts — that's a cheap call and keeps the scanner self-contained.

Future consideration: when the item detail page needs PriceLow/PriceMid for display, refactor both data sources together. For now, this pipeline serves the arbitrage scorer only.

### Scoring Changes

For each item, evaluate a vendor-sell path in addition to the existing MB-sell path:

- **Source worlds:** All worlds including home world. Unlike MB-sell (which excludes home world as a buy source since you're selling there), vendor-sell has no such restriction — buy on home MB, walk to NPC.
- **Profit:** `PriceLow - (cheapestSourcePrice × 1.05)`. No sell-side tax (vendor sells are tax-free). 5% MB purchase tax on the buy side.
- **Score:** `profitPerUnit × sourceConfidence`. No homeConfidence, fairShareVelocity, or turnoverDiscount — vendor sell is instant, guaranteed, with no competition.
- **No velocity gate:** Vendor-sell items are evaluated even when home-world velocity is zero.
- **No home listing gate:** Vendor-sell doesn't require home MB data — only source world listings and PriceLow.

Per item, compare the best MB-sell opportunity against the best vendor-sell opportunity. Output whichever scores higher. The alt source remains the second-best buy source by raw `profitPerUnit` (same as today) — `sellDestination` applies to the primary opportunity only.

### Opportunity Type Changes

Add `sellDestination: 'mb' | 'vendor'` to the `Opportunity` type.

When `sellDestination === 'vendor'`:
- `sellPrice` = PriceLow
- `homeConfidence` = 1.0, `homeDataAgeHours` = 0
- `activeCompetitorCount` = 0
- `fairShareVelocity` = total velocity (no competition split), or 0 if no home data
- `listingPrice` and `listingProfitPerUnit` still reflect home MB for reference

### UI Changes

- **Sell column:** When `sellDestination === 'vendor'`, show PriceLow with an "NPC" badge (same visual style as the existing buy-side NPC badge). No confidence/age indicator — vendor price is deterministic.
- No new sections, filters, or pages. Vendor-sell opportunities appear in the same ranked list. Future filtering (ENG-49) can separate them if desired.

### What's NOT Changing

- Existing NPC buy-source logic (GilShopItem → PriceMid) is untouched.
- Confidence model is unchanged.
- Scanner loop and cache structure are unchanged (new map added, nothing modified).
