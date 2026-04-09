# Universalis Data Analysis for Rowena's Secret

Analysis of Universalis API data relevant to our app features.
Compiled 2026-04-10 from source code review of Universalis, Dalamud, and Teamcraft.

## Upload Ecosystem

Universalis is crowdsourced — data freshness depends entirely on PC players running upload plugins.

| Client | Platform | Market Share | Notes |
|--------|----------|-------------|-------|
| Dalamud/XIVLauncher | PC | Dominant | Uploader enabled by default in the alternative game launcher |
| Teamcraft Desktop | PC | Secondary | Uploads as side effect of crafting planner usage |
| Universalis ACT Plugin | PC | Declining | ACT usage declining as Dalamud absorbs functionality |
| Matcha | PC | Regional | Chinese servers only |

**Console players (PS4/PS5) cannot upload.** This creates systematic data gaps:
- Worlds with higher console-to-PC ratios will have staler data
- Our DC (陸行鳥) is a TW datacenter — unclear what the console/PC ratio is, but TW players likely lean PC

## lastReviewTime Is Fake Post-7.0

**`lastReviewTime` is effectively the same as `lastUploadTime` for all post-Dawntrail (7.0, June 2024) data.** Square Enix removed the underlying game packet field.

### Evidence chain

1. **Dalamud** (`MarketBoardCurrentOfferings.cs`, commit `3e950b09f`, June 30 2024):
   - Before: `listingEntry.LastReviewTime = DateTimeOffset.UtcNow.AddSeconds(-reader.ReadUInt16()).DateTime`
   - After: `internal DateTime LastReviewTime { get; set; } = DateTime.UtcNow` — marked `[Obsolete("Universalis Compatibility, contains a fake value")]`
   - The packet field (a uint16 seconds-ago offset) was removed from the 7.0 packet structure

2. **Teamcraft/pcap-ffxiv** (`marketBoardItemListing.ts`):
   - `lastReviewTime: 0` with comment "Removed in 7.0; using placeholder value for backwards-compatibility"

3. **Universalis server** (`MarketBoardUploadBehavior.cs:309-314`):
   - Falls back to `DateTime.UtcNow` when `lastReviewTimeSeconds` is 0 or null

### Implications

- `worldUploadTimes` comes from `MarketItem.lastUploadTime` in PostgreSQL, populated when the controller merges per-world data (`CurrentlyShownControllerBase.cs:372`) — it is NOT derived from `lastReviewTime`.
- For current data, `lastReviewTime ≈ lastUploadTime`. They are interchangeable as freshness signals.

## Endpoint Analysis Per Feature

### Arbitrage Scanner (current)

**Currently uses:** `GET /{dcName}/{itemIds}` for DC-wide listings, `GET /{worldName}/{itemIds}` for home-world velocity/history.

**Could benefit from:** The Aggregated endpoint (`/aggregated/`) for initial screening. Instead of fetching full listings for all 16,700+ marketable items, we could:
1. Use `/aggregated/{dcName}/{itemIds}` to get `minListing.dc.price` + `dailySaleVelocity` for all items
2. Only fetch full listings (via `/{dcName}/{itemIds}`) for items that pass the initial profit/velocity filter

This would dramatically reduce API load and scan time — the aggregated endpoint hits Redis only and supports 100 items per request.

**Tradeoff:** The aggregated endpoint splits NQ/HQ but doesn't give per-listing detail (quantity, retainer, specific world). Our arbitrage scoring uses listing count and individual prices. A two-phase approach (aggregate screen → detailed fetch for candidates) could work but adds complexity.

### Item Detail Page (current)

**Currently uses:** Client-side `GET /{dcName}/{itemId}` for a single item's cross-world listings.

**No changes needed.** The full listing data is exactly what this page shows. The aggregated endpoint wouldn't help here since we need individual listings.

**Potential enhancement:** Could also fetch `/history/{dcName}/{itemId}?entriesToReturn=100` for a price history chart. The History endpoint's velocity stats are more reliable than CurrentlyShown's (computed over more entries).

### Crafting Optimizer (ENG-64, implemented)

**Currently uses:** Same scan data as arbitrage (listings for market price reference).

**Could benefit from:** `/aggregated/` for ingredient market prices. The solver only needs min price and availability signal (velocity) — exactly what the aggregated endpoint provides. This would be much cheaper than full listing fetches for the recursive ingredient tree.

### Craft-for-Profit Rankings (planned)

**Will need:** For each craftable item: crafting cost (from recipe + ingredient market prices) vs. selling price + velocity.

**Best approach:** `/aggregated/{dcName}/{itemIds}` is ideal here. We need:
- `minListing.dc.price` — what it sells for on the market
- `dailySaleVelocity.dc.quantity` — how fast it moves
- `averageSalePrice.dc.price` — what it actually sells at (vs. listing price)
- For ingredients: same metrics to compute sourcing cost

100 items per request, cached on Universalis side — this endpoint was designed for exactly this use case.

### Retainer Venture Optimizer (planned)

**Will need:** Market prices for venture loot items to rank venture profitability.

**Best approach:** `/aggregated/` again — need price and velocity for ~hundreds of venture loot items. Perfect fit.

## Aggregated Endpoint: Key Behavioral Notes

1. **4-day window** for averageSalePrice and dailySaleVelocity (not 7 like CurrentlyShown)
2. **Revenue-weighted average**: `averageSalePrice = sumRevenue / sumQuantity`, NOT mean of unit prices. This is more accurate for items sold in varying stack sizes.
3. **NQ/HQ split**: Every metric is provided separately for NQ and HQ. Important for items where HQ matters (gear, food, potions).
4. **Scope includes worldId**: `minListing.dc.worldId` tells you which world has the cheapest listing — directly useful for arbitrage ("where to buy").
5. **Failure isolation**: Individual item failures go to `failedItems` array, not a 404 for the whole request.
6. **10-second timeout**: The endpoint has a per-request timeout. Large batches of items where multiple have no data could hit this.

## Data Freshness Considerations

### For our DC (陸行鳥)

- 8 worlds: 伊弗利特, 迦樓羅, 利維坦 (home), 鳳凰, 奧汀, 巴哈姆特, 拉姆, 泰坦
- TW datacenter — smaller player population than JP/NA/EU datacenters
- Expect longer data staleness for niche items compared to major datacenters
- `lastUploadTime` is the only reliable freshness signal

### Freshness as quality signal

When building features that depend on price accuracy:
- **High-velocity items** (popular crafting materials, current-tier gear): data likely fresh within minutes
- **Low-velocity items** (niche glamour, old-tier materials): could be hours or days stale
- Consider showing data age prominently in the UI so users can judge trustworthiness
- For automated decisions (crafting solver, profit rankings), apply confidence decay based on `lastUploadTime`

## WebSocket Considerations

The WebSocket API (`/ws`) could enable real-time price updates instead of polling:
- Subscribe to `listings/add{world=4030}` for home world listing updates
- Subscribe to `sales/add` for sale notifications
- BSON encoding (not JSON) — needs a BSON decoder

**Not recommended for our current architecture.** Our scanner does bulk polling which is simpler and sufficient. WebSocket would be useful if we wanted to show real-time price tickers on individual item pages, but the complexity isn't justified yet.
