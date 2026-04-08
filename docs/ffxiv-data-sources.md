# FFXIV Game Data Sources

Reference document for external data sources available to this project.
Compiled 2026-04-07.

## Current Dependencies

| Source | What we use | Where |
|--------|------------|-------|
| **Universalis API** | Market board listings, sale history, velocity | `src/lib/server/universalis.ts` |
| **XIVAPI v2** | Item icons, English fallback names | `src/lib/client/xivapi.ts` |
| **FFXIV_Market** (beherw) | Traditional Chinese item names (`tw-items.msgpack`) | `src/lib/server/universalis.ts:fetchItemNames()` |

## Data Sources

### XIVAPI v2

- **Base URL:** `https://v2.xivapi.com/api`
- **License:** Public API, no key required
- **Languages:** EN, JA, DE, FR (the four official FFXIV client languages — no TW/KR/ZH)
- **Docs:** https://v2.xivapi.com/api (self-documenting)

Exposes raw FFXIV game data sheets (SaintCoinach) via REST. Supports batched item lookups and search across sheets.

#### Relevant sheets

| Sheet | Rows | Use case |
|-------|------|----------|
| `Item` | ~50,900 | Names, icons, `PriceMid` (NPC buy price), `PriceLow` (NPC sell-back price) |
| `GilShopItem` | ~6,700 unique items | Confirms an item is actually sold by an NPC vendor |
| `Recipe` | ~14,400 | Crafting recipes with ingredients |
| `RetainerTask` | ~1,100 | Retainer venture definitions |

#### Key API patterns

```
# Batch item lookup (we already do this for icons)
GET /api/sheet/Item?rows=10976,43686&fields=Icon,Name,PriceMid

# Search for items in a specific sheet
GET /api/search?sheets=GilShopItem&query=Item=10976&fields=Item.PriceMid&limit=5

# Paginate a subrow sheet (colon-separated row_id:subrow_id)
GET /api/sheet/GilShopItem?after=262144:0&limit=500
```

**Pagination note:** `SheetResponse` has no `next` cursor (unlike `SearchResponse`). To paginate, pass the last row's `row_id:subrow_id` as the `after` parameter. The subrow separator is `:` (colon), per the `RowSpecifier` schema `^\d+(:\d+)?$`.

#### NPC vendor price fields

- `Item.PriceMid` — price to buy from NPC vendor (e.g., 8925 for Mythrite Earrings of Fending)
- `Item.PriceLow` — price NPC pays when you sell to them (e.g., 103)
- These are SaintCoinach field names, community-reverse-engineered, not officially documented
- **Important:** `PriceMid` exists on all items, but only items appearing in `GilShopItem` are actually sold by NPC vendors. Some non-vendor items have `PriceMid=99999`.
- **False positives:** 38 items appear in `GilShopItem` with `PriceMid > 0` but are not actually vendor-purchasable (housing permits, removed items, mislinked crafted gear). These are blocklisted in `src/lib/server/vendors.ts`. See `docs/investigations/2026-04-08-vendor-price-verification.md` for the full list.

---

### Garland Tools

- **Base URL:** `https://garlandtools.org/api/get.php`
- **License:** Undocumented (no official API docs, no published terms)
- **Languages:** EN, JA, DE, FR (no TW/KR/ZH)
- **Icons:** `https://garlandtools.org/files/icons/item/{icon_id}.png` (PNG, Cloudflare-cached)

Complete FFXIV database with a per-item API. Rich data including vendor info, crafting, NPC locations. No bulk/batch endpoint — one item per request.

#### Key fields (item response)

| Field | Meaning | Example |
|-------|---------|---------|
| `price` | NPC buy price (= XIVAPI `PriceMid`) | 8925 |
| `sell_price` | NPC sell-back price (= XIVAPI `PriceLow`) | 103 |
| `icon` | Icon ID for icon URL | 55326 |
| `vendors` | Array of NPC IDs that sell this item | [1011200] |
| `tradeShops` | Currency/token exchange shops | (varies) |
| `craft` | Crafting recipes with ingredients | (varies) |

#### Example

```
GET /api/get.php?type=item&lang=en&version=3&id=10976
→ { "item": { "price": 8925, "sell_price": 103, "vendors": [1011200], ... } }
```

**Verified:** Garland `price` matches XIVAPI `PriceMid` exactly (both read SaintCoinach data).

---

### Teamcraft `extracts.json`

- **Repo:** https://github.com/ffxiv-teamcraft/ffxiv-teamcraft
- **License:** MIT
- **File:** `libs/data/src/lib/extracts/extracts.json` (~27 MB)
- **Languages:** Supports TW Chinese via `tw/` locale files

A single pre-built JSON object keyed by item ID. Each item has a `sources` array containing every acquisition method. Derived from SaintCoinach game data by Teamcraft's extraction pipeline.

#### Source types

| Type ID | Name | Data | Notes |
|---------|------|------|-------|
| 1 | CRAFTED_BY | Recipe ID, job, level, ingredients | Full ingredient lists |
| 2 | TRADE_SOURCES | Currency items, amounts, NPC IDs | Token/tomestone/seal shops |
| 3 | VENDORS | NPC ID, **gil price**, shop name, coords | NPC gil vendors |
| 4 | REDUCED_FROM | Source item IDs | Aetherial reduction |
| 5 | DESYNTHS | Source item IDs | Desynthesis |
| 6 | INSTANCES | Duty IDs | Dungeons, trials, raids |
| 7 | GATHERED_BY | Node locations, levels, spawn times | Mining, botany |
| 8 | GARDENING | Seed info, crossbreeds | Garden plots |
| 9 | VOYAGES | I18n names | Airship/submarine ventures |
| 10 | DROPS | Monster IDs, locations | Monster drops |
| 11 | ALARMS | Timed nodes, weather, bait | Fishing, ephemeral nodes |
| 12 | MASTERBOOKS | Book IDs | Required recipe books |
| 13 | TREASURES | Map IDs | Treasure maps |
| 14 | FATES | FATE IDs, locations | FATE rewards |
| 15 | VENTURES | Venture IDs | Retainer ventures (IDs only) |
| 18 | QUESTS | Quest IDs | Quest rewards |
| 19 | ACHIEVEMENTS | Achievement IDs | Achievement rewards |
| 21 | MOGSTATION | Mogstation item data | Cash shop |

#### Example vendor entry

```json
{
  "id": 1601,
  "sources": [
    {
      "type": 3,
      "data": [{
        "npcId": 1000217,
        "price": 63,
        "shopName": { "en": "Purchase Weapons (Lv. 1-9)", "ja": "武器の購入（Lv1～9）" },
        "coords": { "x": 14.6, "y": 9.7 },
        "zoneId": 53,
        "mapId": 3
      }]
    }
  ]
}
```

#### Type definitions

Located in the Teamcraft repo at `libs/types/src/lib/list/`:
- `data-type.ts` — `DataType` enum
- `extracts/extracts.ts` — `ExtractRow`, `Extracts` types
- `extracts/item-source.ts` — discriminated union of all source types
- `source/vendor.ts`, `crafted-by.ts`, etc. — individual source interfaces

---

### FFXIV_Market (beherw)

- **Repo:** https://github.com/beherw/FFXIV_Market
- **License:** None (all rights reserved)
- **Format:** MessagePack files in `public/data/`
- **Full survey:** See `docs/ffxiv-market-data-survey.md` (ENG-81)

A TW-focused market board dashboard. Pre-builds game data into msgpack files using Teamcraft's `extracts.json` as the upstream source, enriched with TW Chinese names from their own `tw_dataminer/` pipeline (SaintCoinach extraction from the TW game client).

#### Files we use or plan to adopt

| File | Size | Content | Status |
|------|------|---------|--------|
| `tw-items.msgpack` | 1.3 MB | `Record<itemID, { tw: string }>` — TW Chinese item names | **In use** (fetched from GitHub raw at startup) |
| `recipes.msgpack` | 4.4 MB | Recipe array with ingredients, jobs, yields | **Adopt next** (Crafting Optimizer) |
| `obtainable-methods.msgpack` | 20.4 MB | `Record<itemID, ObtainSource[]>` — all acquisition methods | Adopt for Item Detail |
| `equipment.msgpack` | 2.5 MB | Equipment level, jobs, slot category | Adopt for Item Detail |

Full inventory of all 21 files: `docs/ffxiv-market-data-survey.md` §1.

---

## Cross-Reference: NPC Vendor Prices

All three sources derive from the same upstream (SaintCoinach game sheets) and return identical values:

| Source | Field name | Value for item 10976 |
|--------|-----------|---------------------|
| XIVAPI v2 | `Item.PriceMid` | 8925 |
| Garland Tools | `item.price` | 8925 |
| Teamcraft | `sources[type=3].data[].price` | 8925 |

## Strategic Notes

See [ADR-012](decisions/ADR-012-adopt-ffxiv-market-msgpack.md) for the full decision rationale.

- **Primary data source:** FFXIV_Market's pre-built msgpack files for item names, recipes, equipment, and obtainable methods. These are derived from Teamcraft's extracts (MIT licensed upstream) and include TW Chinese — the only source with complete TW translations.
- **Integration method:** Git submodule, copy needed files at build time. No runtime fetch to GitHub.
- **XIVAPI v2 retained for:** Item icons (`Item.Icon`), vendor price verification (`GilShopItem` + `Item.PriceMid`). These are lightweight calls that don't justify pre-building.
- **Server-side loading:** Unlike FFXIV_Market (a pure SPA), we decode msgpack server-side in SvelteKit loaders. Node.js keeps data in memory; clients never download multi-MB data files.
- **TW Chinese names** remain uniquely available from FFXIV_Market. No other source has comparably complete TW translations. This dependency is the hardest to replace.
