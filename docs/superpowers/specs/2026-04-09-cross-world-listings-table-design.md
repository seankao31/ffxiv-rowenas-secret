# Cross-World Listings Table (ENG-61)

Display all current market board listings for an item across all worlds in the 陸行鳥 DC.

## Data Layer

### Shared module — `src/lib/shared/universalis.ts`

Extract from `src/lib/server/universalis.ts`:
- `DC_NAME` (`'陸行鳥'`)
- `DC_WORLDS` (array of `{ id, name }` for all 8 worlds)
- `HOME_WORLD_ID` (`4030`)
- `BASE_URL` (`'https://universalis.app/api/v2'`)

Server module imports these from shared — no behavior change.

### Client module — `src/lib/client/universalis.ts`

Single function: `fetchItemListings(itemId: number): Promise<Listing[]>`

- Calls `GET {BASE_URL}/{DC_NAME}/{itemId}`
- Maps response to `Listing[]` (reusing type from `shared/types.ts`)
- Converts `lastReviewTime` from seconds to milliseconds (matching server convention)
- Returns listings sorted by `pricePerUnit` ascending
- On failure (network error, non-200): logs warning, returns empty array

### Server module refactor — `src/lib/server/universalis.ts`

Replace inline constants with imports from `src/lib/shared/universalis.ts`. No functional change to scanner or any existing behavior.

## Component — `ListingsTable.svelte`

`src/lib/components/ListingsTable.svelte`

### Props

- `itemId: number`

### State

- `listings: Listing[]` — raw data from Universalis
- `selectedWorld: string` — `'all'` (default) or a world name
- `hqOnly: boolean` — `false` by default
- `loading: boolean` — true during fetch

### Derived

Filtered+sorted view: filter by `selectedWorld`, filter by `hqOnly`, sort by `pricePerUnit` ascending.

### Controls bar

Above the table:
- **World dropdown**: "All Worlds" + one entry per world from `DC_WORLDS`
- **HQ toggle**: Filters to HQ-only listings when active

### Table columns

| Column | Source | Format |
|--------|--------|--------|
| World | `listing.worldName` | Text |
| Price | `listing.pricePerUnit` | Number with comma separator |
| Qty | `listing.quantity` | Number |
| Total | `pricePerUnit * quantity` | Number with comma separator |
| HQ | `listing.hq` | Icon or badge |
| Last Review | `listing.lastReviewTime` | Relative time (e.g., "2h ago") |

### Loading state

Skeleton rows matching existing page pattern.

### Empty states

- No listings returned from API: "No listings found"
- Filters produce zero results: "No listings match the current filters"

### Error state

Universalis unreachable or non-200: "Unable to load listings" message in the card body.

## Page Integration — `src/routes/item/[id]/+page.svelte`

Replace the "Cross-World Listings" skeleton placeholder with `<ListingsTable {itemId} />`. Other skeleton cards (Sale History, Price Statistics) remain unchanged.

## Testing

### Unit tests

- **Shared module**: constants exported correctly, server module works after refactor
- **Client module**: mock `fetch`, verify response mapping (including `lastReviewTime * 1000`), verify error handling returns empty array

### E2e tests

- Mock Universalis DC endpoint response
- Table renders with correct columns and data
- World filter narrows displayed listings
- HQ toggle filters correctly
- Empty state when no listings match filters
- Error state when Universalis is unreachable

## Decisions

- **Client-side fetch**: Direct to Universalis, no server proxy. Avoids contention with scanner rate limiter; per-client rate limits are sufficient.
- **Individual listings**: Not per-world aggregation. Traders need exact prices and quantities.
- **No row highlighting**: Dropped home-world color-coding and cheapest-listing highlight for simplicity.
- **Sort by price only**: Fixed ascending sort. Multi-column sorting deferred.
- **Component split**: Separate client module from table component. Client module reusable by future sale history and price stats components.
