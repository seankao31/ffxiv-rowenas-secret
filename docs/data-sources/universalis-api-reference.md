# Universalis v2 API Reference

Base URL: `https://universalis.app/api/v2`
Source: [github.com/Universalis-FFXIV/Universalis](https://github.com/Universalis-FFXIV/Universalis)
License: MIT

## Rate Limits

| Limit | Value |
|-------|-------|
| Sustained requests | 25 req/s |
| Burst | 50 req/s |
| Max concurrent connections | 8 per IP |

No authentication required.

## Conventions

- `worldDcRegion` accepts a **world name**, **data center name**, or **region name** (Japan, Europe, North-America, Oceania, China, 中国). Numeric IDs also work.
- `itemIds` can be a single ID or **comma-separated, max 100**.
- Multi-item requests wrap results in `{ items: Record<itemId, ...>, unresolvedItems: int[] }` — invalid IDs appear in `unresolvedItems` instead of causing 404.
- `fields` query param supports sparse field selection (e.g., `listings.pricePerUnit` for single-item, `items.listings.pricePerUnit` for multi-item).

### Timestamp units (critical — they are inconsistent)

| Field | Unit | Context |
|-------|------|---------|
| `lastUploadTime` | **milliseconds** since epoch | Response field |
| `worldUploadTimes` values | **milliseconds** since epoch | Response field |
| `lastReviewTime` (listing) | **seconds** since epoch | Response field |
| `timestamp` (sale) | **seconds** since epoch | Response field |
| `statsWithin` param | **milliseconds** | Query param |
| `entriesWithin` param | **seconds** | Query param |
| `entriesUntil` param | **seconds** | Query param |

### Timestamp semantics (verified from source code)

- **`lastUploadTime`** — The time when an upload client (ACT plugin) last submitted data for this world/item pair. Stored per `(worldId, itemId)` in PostgreSQL's `MarketItem` table. For DC queries, this is `max(lastUploadTime)` across all worlds.
- **`worldUploadTimes`** — In DC/region queries, a map of `{ worldId: lastUploadTime }` for each world. Each value is that world's `MarketItem.lastUploadTime` for this item. Only present in DC/region responses (null for single-world queries).
- **`lastReviewTime`** (per listing) — **Historically** (pre-7.0): a real game client timestamp, a uint16 relative offset in seconds representing when the seller last opened their retainer sale list. Dalamud parsed it as `DateTimeOffset.UtcNow.AddSeconds(-reader.ReadUInt16())`. **Post-Dawntrail (7.0, June 2024)**: Square Enix removed this field from the network packet. Both major upload clients now send fake values:
  - **Dalamud**: sends `DateTime.UtcNow` (marked `[Obsolete("Universalis Compatibility, contains a fake value")]` in `MarketBoardCurrentOfferings.cs:205`, commit `3e950b09f`)
  - **Teamcraft/pcap-ffxiv**: sends `0` (hardcoded with comment "Removed in 7.0; using placeholder value for backwards-compatibility")
  - **Universalis server**: falls back to `DateTime.UtcNow` when value is `0` or null (`MarketBoardUploadBehavior.cs:312-313`)
  - **Result**: For all post-7.0 data, `lastReviewTime ≈ upload time ≈ lastUploadTime`. The two timestamps will not meaningfully diverge.
- **Practical implication:** `lastReviewTime` and `lastUploadTime` are equivalent for current data. Neither is a "better" freshness signal — they both reflect when an upload client user last visited the market board for this item.

---

## Endpoints

### 1. CurrentlyShown — `GET /{worldDcRegion}/{itemIds}`

**The primary endpoint.** Returns current listings + recent sale history + computed stats.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `listings` | string | all | Max listings to return per item |
| `entries` | string | 5 | Max recent history entries per item |
| `hq` | string | both | Filter: `true`, `false`, or empty for both |
| `statsWithin` | string | 604800000 (7d) | Stats window in **ms** |
| `entriesWithin` | string | — | Entry recency filter in **seconds** |
| `fields` | string | all | Sparse field selection |

**Response (single item):**

```typescript
{
  itemID: number
  worldID?: number           // null for DC/region queries
  worldName?: string
  dcName?: string
  regionName?: string
  lastUploadTime: number     // ms since epoch
  hasData: boolean           // true if item has ever been uploaded

  // Listings
  listings: ListingView[]
  listingsCount: number      // total count (may differ from array if limited)
  unitsForSale: number       // sum of all listing quantities

  // Recent sale history
  recentHistory: SaleView[]
  recentHistoryCount: number
  unitsSold: number          // sum of sale quantities

  // Computed stats — over current listings
  currentAveragePrice: number    // mean listing price (all)
  currentAveragePriceNQ: number
  currentAveragePriceHQ: number
  minPrice: number
  minPriceNQ: number
  minPriceHQ: number
  maxPrice: number
  maxPriceNQ: number
  maxPriceHQ: number

  // Computed stats — over recent sales
  averagePrice: number           // mean sale price (all)
  averagePriceNQ: number
  averagePriceHQ: number
  regularSaleVelocity: number    // sales/day over statsWithin window
  nqSaleVelocity: number
  hqSaleVelocity: number

  // Histograms
  stackSizeHistogram?: Record<string, number>
  stackSizeHistogramNQ?: Record<string, number>
  stackSizeHistogramHQ?: Record<string, number>

  // DC/region only
  worldUploadTimes?: Record<number, number>  // worldId -> ms since epoch
}
```

**Response (multiple items):**

```typescript
{
  itemIDs: number[]
  items: Record<string, CurrentlyShownView>  // keyed by item ID
  worldID?: number
  worldName?: string
  dcName?: string
  regionName?: string
  unresolvedItems: number[]
}
```

**Implementation details (from source):**
- For DC/region queries, the server fetches from each world separately and merges: listings from all worlds combined, sales from all worlds combined, stats computed over the merged set.
- `regularSaleVelocity` on the CurrentlyShown endpoint is computed over the *returned* sale entries (default 5), making it less useful than the History endpoint's velocity. The docs note: "This statistic is more useful in historical queries."
- `worldUploadTimes` in the DC response is populated as `{ worldId: MarketItem.lastUploadTime }` for each world — it is NOT derived from `max(lastReviewTime)`.

---

### 2. Aggregated — `GET /aggregated/{worldDcRegion}/{itemIds}`

**Preferred for bulk lookups.** Uses only Redis-cached values — faster and cheaper than CurrentlyShown. Use this when you don't need individual listings/sales.

No query params (besides `User-Agent` header).

**Response:**

```typescript
{
  results: Array<{
    itemId: number
    nq: AggregatedResult
    hq: AggregatedResult
    worldUploadTimes?: Array<{ worldId: number, timestamp: number }>
  }>
  failedItems: number[]
}
```

Each `AggregatedResult` contains five metrics, each at three scope levels (world, dc, region):

```typescript
type AggregatedResult = {
  minListing: {
    world?: { price: number }
    dc?: { price: number, worldId?: number }
    region?: { price: number, worldId?: number }
  }
  medianListing: {
    world?: { price: number }
    dc?: { price: number }
    region?: { price: number }
  }
  recentPurchase: {
    world?: { price: number, timestamp: number }
    dc?: { price: number, timestamp: number, worldId?: number }
    region?: { price: number, timestamp: number, worldId?: number }
  }
  averageSalePrice: {
    world?: { price: number }
    dc?: { price: number }
    region?: { price: number }
  }
  dailySaleVelocity: {
    world?: { quantity: number }
    dc?: { quantity: number }
    region?: { quantity: number }
  }
}
```

**Implementation details (from source):**
- `averageSalePrice` and `dailySaleVelocity` are computed over the **last 4 days** (not 7 like CurrentlyShown).
- `averageSalePrice.price = sumRevenue / sumQuantity` (revenue-weighted average, not simple mean of prices).
- `minListing` at dc/region level includes `worldId` identifying which world has the cheapest listing.
- `recentPurchase.timestamp` is in **milliseconds** (converted from internal DateTime).
- All values come from Redis aggregates updated asynchronously on upload — **eventually consistent** with a brief lag.
- 10-second timeout per request; individual item failures are reported in `failedItems` rather than failing the whole request.

---

### 3. History — `GET /history/{worldDcRegion}/{itemIds}`

Deep sale history with time/price filtering.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `entriesToReturn` | string | 1800 | Max entries per item (max 99999) |
| `statsWithin` | string | 604800000 (7d) | Stats window in **ms** |
| `entriesWithin` | string | 604800 (7d) | Entry recency filter in **seconds** |
| `entriesUntil` | string | now | Upper time bound in **seconds** |
| `minSalePrice` | int32 | 0 | Min unit price filter |
| `maxSalePrice` | int32 | 2147483647 | Max unit price filter |

**Response (single item):**

```typescript
{
  itemID: number
  worldID?: number
  lastUploadTime: number      // ms since epoch
  entries: MinimizedSaleView[]
  dcName?: string
  regionName?: string
  stackSizeHistogram?: Record<string, number>
  stackSizeHistogramNQ?: Record<string, number>
  stackSizeHistogramHQ?: Record<string, number>
  regularSaleVelocity: number
  nqSaleVelocity: number
  hqSaleVelocity: number
  worldName?: string
}
```

**Implementation details (from source):**
- Sales stored in ScyllaDB, partitioned by `(itemId, worldId)`, clustered by `sale_time DESC`.
- Deduplicated via SHA-256 fingerprint of `(itemId, worldId, price, quantity, saleTime, buyer, hq)`.
- `regularSaleVelocity` here is computed over the full `entriesToReturn` window, making it more representative than the CurrentlyShown endpoint's velocity.

---

### 4. Tax Rates — `GET /tax-rates?world={world}`

Current market tax rates per city.

```typescript
{
  "Limsa Lominsa": number  // percent, e.g. 5
  "Gridania": number
  "Ul'dah": number
  "Ishgard": number
  "Kugane": number
  "Crystarium": number
  "Old Sharlayan": number
  "Tuliyollal": number
}
```

---

### 5. Metadata Endpoints

**Data Centers** — `GET /data-centers` → `Array<{ name, region, worlds: number[] }>`

**Worlds** — `GET /worlds` → `Array<{ id, name }>`

**Marketable Items** — `GET /marketable` → `number[]` (flat array of all tradeable item IDs)

---

### 6. Stats Endpoints

| Endpoint | Params | Returns |
|----------|--------|---------|
| `GET /extra/stats/most-recently-updated` | `world` or `dcName`, `entries` (max 200) | `{ items: Array<{ itemID, lastUploadTime, worldID, worldName }> }` |
| `GET /extra/stats/least-recently-updated` | same | same (oldest first) |
| `GET /extra/stats/recently-updated` | none | `{ items: number[] }` (legacy, no world info) |
| `GET /extra/stats/world-upload-counts` | none | `Record<worldName, { count, proportion }>` |
| `GET /extra/stats/uploader-upload-counts` | none | `Array<{ sourceName, uploadCount }>` |
| `GET /extra/stats/upload-history` | none | `{ uploadCountByDay: number[] }` (30 days) |

---

### 7. User Lists — `GET /lists/{listId}`

```typescript
{ id: string, created: string, updated: string, name: string, itemIDs: number[] }
```

---

### 8. WebSocket — `GET /ws`

Binary BSON encoding. Channels: `listings/add`, `listings/remove`, `sales/add`, `sales/remove`, `item/update`.

Subscribe: `{ event: "subscribe", channel: "listings/add{world=73,item=5}" }`

Property filters applied via reflection; hierarchical matching (`listings` matches `listings/add`).

---

## Sub-Schemas

### ListingView

| Field | Type | Description |
|-------|------|-------------|
| `lastReviewTime` | int64 | Listing post time, **seconds** since epoch |
| `pricePerUnit` | int32 | Unit price |
| `quantity` | int32 | Stack size |
| `total` | int32 | pricePerUnit * quantity |
| `tax` | int32 | Gil sales tax (computed server-side) |
| `hq` | boolean | High-quality flag |
| `isCrafted` | boolean | Whether item is player-crafted |
| `onMannequin` | boolean | Mannequin sale |
| `worldID` | int32? | World ID (DC/region queries) |
| `worldName` | string? | World name |
| `retainerCity` | int32 | City ID: 1=Limsa, 2=Gridania, 3=Ul'dah, 4=Ishgard, 7=Kugane, 10=Crystarium, 12=Old Sharlayan |
| `retainerName` | string? | Retainer name |
| `retainerID` | string? | Retainer ID (hashed) |
| `creatorName` | string? | Crafter name |
| `creatorID` | string? | SHA256 of creator ID |
| `sellerID` | string? | SHA256 of seller ID |
| `listingID` | string? | Unique listing ID |
| `stainID` | int32 | Dye ID |
| `materia` | `Array<{ slotID, materiaID }>` | Attached materia |

### SaleView (CurrentlyShown recentHistory)

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | int64 | Sale time, **seconds** since epoch |
| `pricePerUnit` | int32 | Unit price |
| `quantity` | int32 | Stack size |
| `total` | int32 | Total price |
| `hq` | boolean | High-quality |
| `onMannequin` | boolean? | Mannequin purchase |
| `worldID` | int32? | World ID |
| `worldName` | string? | World name |
| `buyerName` | string? | Buyer character name |

### MinimizedSaleView (History entries)

Same as SaleView but without `total` field.

---

## Architecture Notes (from source code)

### Data Storage

| Data | Storage | Why |
|------|---------|-----|
| Current listings | PostgreSQL | ACID, full-replacement model |
| Sale history | ScyllaDB | Time-series, append-only, horizontal scaling |
| Aggregates | Redis | Sub-ms lookups, sorted sets for rankings |
| Hot data | In-memory (5min TTL, 100K limit) | Request-level cache |

### Data Freshness Model

Universalis is **crowdsourced** — data is only as fresh as the last upload by a game plugin user. Key implications:
- Popular items on popular worlds are refreshed frequently (minutes).
- Niche items on low-population worlds may be hours or days stale.
- `lastUploadTime` is the best signal for "how trustworthy is this data."
- Listings follow a **full replacement** model: each upload replaces ALL listings for that world/item. Missing listings are assumed sold/expired.
- Aggregates (minListing, recentSale, tradeVelocity) are **eventually consistent** — updated asynchronously after uploads via fire-and-forget Redis commands.

### Trade Velocity in Redis

- Stored as daily quantity and revenue buckets: `sale-qu:{scope}:{itemId}:{hq|nq}:{dateOrdinal}` and `sale-pr:...`
- 7-day TTL on velocity keys
- Velocity = totalQuantity / dayCount over the period
- The Aggregated endpoint computes over 4 days; CurrentlyShown/History compute over the returned entries (configurable via `statsWithin`)
