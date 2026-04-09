---
name: universalis-v2
description: Use when writing code that calls the Universalis v2 API — market board listings, sale history, aggregated prices, data freshness, or any fetch to universalis.app. Triggers on Universalis URL patterns, market board data types, or timestamp field questions.
---

# Universalis v2 API Skill

Base URL: `https://universalis.app/api/v2`. No authentication required.
Full reference with response schemas: `docs/data-sources/universalis-api-reference.md`.

## Rate Limits

| Limit | Value |
|-------|-------|
| Sustained | 25 req/s |
| Burst | 50 req/s |
| Max concurrent per IP | 8 |

Set a `User-Agent` header for identification.

## Endpoints

### Aggregated — `GET /aggregated/{worldDcRegion}/{itemIds}`

**Preferred for bulk lookups.** Returns only pre-computed aggregates from Redis — no individual listings or sales. Up to 100 comma-separated item IDs.

Response per item, split by `nq`/`hq`:
- `minListing.{world,dc,region}` — cheapest listing price (dc/region include `worldId` of cheapest world)
- `medianListing.{world,dc,region}` — median listing price
- `recentPurchase.{world,dc,region}` — most recent sale price + timestamp (ms) + worldId
- `averageSalePrice.{world,dc,region}` — revenue-weighted avg over last **4 days** (sumRevenue / sumQuantity)
- `dailySaleVelocity.{world,dc,region}` — sales/day over last **4 days**
- `worldUploadTimes[]` — per-world freshness timestamps (ms)

Scope hierarchy: world < dc < region. When querying a world, you still get dc and region aggregates.

### CurrentlyShown — `GET /{worldDcRegion}/{itemIds}`

Full listing and recent sale data. Up to 100 comma-separated item IDs.

Query params:
- `listings` — max listings to return (default: all)
- `entries` — max recent history entries (default: 5)
- `hq` — filter: `true`, `false`, or empty
- `statsWithin` — stats window in **milliseconds** (default: 7 days)
- `entriesWithin` — entry recency filter in **seconds**
- `fields` — sparse field selection (e.g., `listings.pricePerUnit`)

Returns: listings array, recentHistory array, computed stats (currentAveragePrice, minPrice, maxPrice, saleVelocity, etc.), worldUploadTimes (DC/region queries only).

**Single-item vs multi-item responses have different schemas:**
- Single item: returns `CurrentlyShownView` directly
- Multiple items: returns `{ items: Record<itemId, CurrentlyShownView>, unresolvedItems: number[] }`

### History — `GET /history/{worldDcRegion}/{itemIds}`

Deep sale history. Up to 100 comma-separated item IDs.

Query params:
- `entriesToReturn` — max entries (default: 1800, max: 99999)
- `statsWithin` — stats window in **milliseconds** (default: 7 days)
- `entriesWithin` — entry recency in **seconds** (default: 7 days)
- `entriesUntil` — upper time bound in **seconds** (default: now)
- `minSalePrice` / `maxSalePrice` — price range filters

Sale velocity stats here are computed over the full returned entry set, making them more representative than CurrentlyShown's velocity (which uses only 5 entries by default).

### Other Endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /marketable` | `number[]` — all tradeable item IDs |
| `GET /tax-rates?world={name}` | Tax percent per city (Limsa, Gridania, Ul'dah, Ishgard, Kugane, Crystarium, Old Sharlayan, Tuliyollal) |
| `GET /data-centers` | `Array<{ name, region, worlds: number[] }>` |
| `GET /worlds` | `Array<{ id, name }>` |
| `GET /extra/stats/most-recently-updated?world={w}&entries=N` | Items with freshest data (max 200) |
| `GET /extra/stats/least-recently-updated?world={w}&entries=N` | Stalest items (max 200) |
| `GET /lists/{listId}` | User-created item lists |
| `GET /ws` | WebSocket — BSON-encoded real-time updates (channels: `listings/add`, `listings/remove`, `sales/add`, `item/update`) |

## Timestamp Units — CRITICAL

The API uses **inconsistent units**. Getting this wrong causes silent data corruption.

| Field/Param | Unit |
|-------------|------|
| `lastUploadTime` (response) | **milliseconds** since epoch |
| `worldUploadTimes` values (response) | **milliseconds** since epoch |
| `lastReviewTime` on listings (response) | **seconds** since epoch |
| `timestamp` on sales (response) | **seconds** since epoch |
| `statsWithin` (query param) | **milliseconds** |
| `entriesWithin` (query param) | **seconds** |
| `entriesUntil` (query param) | **seconds** |

## Timestamp Semantics (Verified From Source Code)

- **`lastUploadTime`** — When an upload client last submitted data for this world/item. Stored per `(worldId, itemId)` in the `MarketItem` table. For DC queries, `max(lastUploadTime)` across worlds.
- **`worldUploadTimes`** — DC/region queries only. Map of `{ worldId: lastUploadTime(ms) }`. Each value is that world's per-item upload time. Null for single-world queries.
- **`lastReviewTime`** — Per-listing timestamp. **Post-Dawntrail (7.0, June 2024), this is effectively the upload time.** The game packet no longer contains this field. Dalamud sends `DateTime.UtcNow`; Teamcraft sends `0` (Universalis falls back to `UtcNow`). Pre-7.0 data had real values (seconds-ago offset from when seller last opened retainer sale list). See `docs/data-sources/universalis-api-reference.md` for full provenance chain with source code references.

## Listing Schema (Key Fields)

```
lastReviewTime: int64   — seconds since epoch
pricePerUnit: int32     — unit price
quantity: int32         — stack size
total: int32            — pricePerUnit * quantity
tax: int32              — Gil sales tax (computed server-side)
hq: boolean
worldID: int32?         — present in DC/region queries
worldName: string?
retainerCity: int32     — 1=Limsa, 2=Gridania, 3=Ul'dah, 4=Ishgard, 7=Kugane, 10=Crystarium, 12=Old Sharlayan
retainerName: string?
isCrafted: boolean
onMannequin: boolean
materia: Array<{ slotID, materiaID }>
listingID: string?      — unique listing identifier
```

## Sale Schema (Key Fields)

```
timestamp: int64        — seconds since epoch
pricePerUnit: int32
quantity: int32
hq: boolean
worldID: int32?         — present in DC/region queries
worldName: string?
buyerName: string?
```

History endpoint uses `MinimizedSaleView` (no `total` field). CurrentlyShown uses `SaleView` (has `total`).

## Data Model

- **Listings** are stored in PostgreSQL with **full replacement** on upload: each upload replaces ALL listings for that world/item pair. Missing listings = assumed sold/expired.
- **Sales** are stored in ScyllaDB (append-only time-series). Deduplicated via SHA-256 fingerprint of `(itemId, worldId, price, quantity, saleTime, buyer, hq)`.
- **Aggregates** (minListing, recentSale, tradeVelocity) live in Redis, updated async after uploads. Eventually consistent.
- **In-memory cache** on Universalis server: 5-min TTL, 100K item limit.

## Batching Rules

- Max **100 items** per request on all multi-item endpoints.
- `worldDcRegion` accepts world name, DC name, region name (Japan, Europe, North-America, Oceania, China, 中国), or numeric IDs.
- Invalid item IDs in multi-item requests appear in `unresolvedItems` (no 404). Invalid world/DC returns 404.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Treating `lastReviewTime` (seconds) as ms | Multiply by 1000 |
| Using `statsWithin` in seconds | It's **milliseconds**. 7 days = `604800000` |
| Assuming single-item and multi-item have same response shape | Single returns data directly; multi wraps in `{ items: {...} }` |
| Using `regularSaleVelocity` from CurrentlyShown for ranking | Computed over only returned entries (default 5). Use History or Aggregated instead |
| Not handling `unresolvedItems` | Check array; log/skip unresolved IDs |
