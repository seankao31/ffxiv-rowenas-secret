# Sale History and Price Stats (ENG-62)

Display recent sale history and computed price statistics on the item detail page, covering all worlds in the 陸行鳥 DC.

## Data Layer

### Type — `src/lib/shared/types.ts`

New `Sale` type alongside existing `Listing`:

```ts
export type Sale = {
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  timestamp: number       // unix ms (converted from API seconds at ingest)
  hq: boolean
  buyerName: string | null
}
```

Existing `SaleRecord` (server-side, home-world only) stays untouched.

### Client module — `src/lib/client/universalis.ts`

New function: `fetchItemSaleHistory(itemId: number): Promise<Sale[]>`

- Calls `GET {BASE_URL}/history/{DC_NAME}/{itemId}` with `entriesToReturn=200`
- Maps response `entries` to `Sale[]`
- Converts `timestamp` from seconds to milliseconds (addressing ENG-94 deferred follow-up #4)
- Returns sales sorted by `timestamp` descending (most recent first)
- On failure: throws (caller handles error state)

Uses the History endpoint rather than CurrentlyShown because the default 5 entries from CurrentlyShown is insufficient for meaningful stats. History endpoint returns `MinimizedSaleView` (no `total` field — computed in the table).

Entry count (200) rather than time window: unpopular items may have very few sales in 7 days, so a fixed entry count ensures the table always shows meaningful history regardless of trade frequency. The stats component filters by time window (24h/7d) internally from whatever entries are returned.

## SaleHistoryTable Component

`src/lib/components/SaleHistoryTable.svelte`

### Props

- `sales: Sale[]`
- `loading: boolean`
- `error: boolean`

Presentational only — no internal fetch. Data comes from the page.

### Table columns

| Column | Source | Format |
|--------|--------|--------|
| World | `sale.worldName` | Text |
| Price | `sale.pricePerUnit` | Locale-formatted number |
| Qty | `sale.quantity` | Number |
| Total | `pricePerUnit * quantity` | Locale-formatted number |
| HQ | `sale.hq` | `★` or empty |
| Buyer | `sale.buyerName` | Text, or `—` if null |
| Date | `sale.timestamp` | Relative time (e.g., "2h ago") |

No filters (world selector, HQ toggle deferred to a separate feature).

Sorted by timestamp descending (most recent first), matching input order from fetch.

### States

- **Loading**: skeleton rows (matching listings pattern)
- **Error**: "Unable to load sale history"
- **Empty**: "No sale history found"
- **Populated**: scrollable table with `overflow-auto min-h-0`

## PriceStats Component

`src/lib/components/PriceStats.svelte`

### Props

- `sales: Sale[]`
- `loading: boolean`
- `error: boolean`

### Computed stats

All computed from the `Sale[]` array, filtered by time window:

| Stat | Computation |
|------|-------------|
| Min price | `Math.min(...prices)` |
| Median price | Middle value of sorted prices |
| Avg price | `sum(price * qty) / sum(qty)` (revenue-weighted) |
| Volume (24h) | `sum(qty)` for sales within last 24 hours |
| Volume (7d) | `sum(qty)` for sales within last 7 days |
| NQ velocity (24h / 7d) | Volume of `hq === false` sales in each window |
| HQ velocity (24h / 7d) | Volume of `hq === true` sales in each window |

### Layout

Compact stat grid (responsive: wraps on mobile). Key-value pairs, not a table. Fits inside the existing "Price Statistics" card.

### States

- **Loading**: skeleton blocks
- **Empty**: "No data available" (when sales array is empty)
- **Populated**: stat grid

## Page Integration — `src/routes/item/[id]/+page.svelte`

The page fetches sale history and distributes it to both components:

- New `$effect` calling `fetchItemSaleHistory(data.itemID)`, managing `sales`/`loading`/`error` state
- Replaces "Sale History" skeleton placeholder with `<SaleHistoryTable {sales} {loading} {error} />`
- Replaces "Price Statistics" skeleton placeholder with `<PriceStats {sales} {loading} {error} />`
- `ListingsTable` remains self-contained (fetches its own data, unchanged)

```
┌─────────────────────┬─────────────────────┐
│  Cross-World        │  Sale History        │
│  Listings           │  (SaleHistoryTable)  │
│  (self-contained)   │  (prop-driven)       │
└─────────────────────┴─────────────────────┘
┌───────────────────────────────────────────┐
│  Price Statistics (PriceStats)            │
│  (prop-driven, same Sale[] data)         │
└───────────────────────────────────────────┘
```

## Testing

### Unit tests

- **Client module**: mock `fetch`, verify History endpoint URL and `entriesWithin` param, verify response mapping (including `timestamp * 1000`), verify sort order, verify error propagation
- **PriceStats logic**: test stat computations (min, median, weighted avg, volume windows, HQ/NQ split) with known data sets, including edge cases (empty array, single entry, all HQ, all NQ)

### E2e tests

- Mock Universalis History endpoint response
- SaleHistoryTable renders correct columns and data
- PriceStats displays computed values
- Loading states render skeletons
- Error state shows error message
- Empty state when no history

### Visual verification

Playwright MCP screenshot of the item detail page with populated data.

## Decisions

- **History endpoint over CurrentlyShown**: CurrentlyShown defaults to 5 entries — insufficient for 7-day stats. History endpoint provides deep sale data with time-range filtering.
- **Prop-driven components**: SaleHistoryTable and PriceStats receive data from the page rather than fetching internally. Avoids duplicate fetches since both consume the same dataset.
- **No filters**: World selector and HQ toggle deferred to a separate feature, keeping ENG-62 focused on displaying the data.
- **Revenue-weighted average**: `sum(price * qty) / sum(qty)` rather than simple mean of prices, to avoid small-quantity sales skewing the average.
- **`Sale` type separate from `SaleRecord`**: `SaleRecord` is used server-side for home-world-only history (no world info). `Sale` is the DC-wide client type with `worldName`/`worldID`. A follow-up (Approach B) may unify the fetch with listings.

## Follow-ups

- **Combined fetch (Approach B)**: Listings and history come from the same Universalis endpoint. A future refactor could fetch both in one request and make ListingsTable prop-driven too.
- **Per-world filter**: Add world selector and HQ toggle to sale history and price stats (and potentially unify with listings filter).
