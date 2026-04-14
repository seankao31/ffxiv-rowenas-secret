# ENG-132: Promote World and HQ Filters to Page Level

## Problem

The Cross-World Listings section has world and HQ filters scoped to just that component. Sale History and Price Statistics show unfiltered data, so users can't compare per-server trends across all three sections.

## Solution

Promote filter state to `+page.svelte` and apply it consistently across all Market tab sections via a shared filter helper.

## Design

### Filter state ownership

Move `selectedWorld` and `hqOnly` from `ListingsTable.svelte` to `+page.svelte` as page-level `$state` variables (defaults: `'all'` and `false`).

### Filter UI placement

Render filter controls (world select + HQ toggle) in `+page.svelte`, between the tab bar and Market tab content. Only visible when `activeTab === 'market'`.

### Shared filter helper

Create `applyMarketFilters` in `src/lib/client/market-filters.ts`:

```ts
type Filterable = { worldName: string; hq: boolean }

function applyMarketFilters<T extends Filterable>(
  items: T[],
  selectedWorld: string,
  hqOnly: boolean
): T[]
```

Works for both `Listing[]` and `Sale[]` since both types have `worldName` and `hq`.

### Component changes

- **`ListingsTable`**: Remove local filter state and filter UI. Accept `selectedWorld` and `hqOnly` as props; apply filtering via shared helper internally.
- **`SaleHistoryTable`**: Accept `selectedWorld` and `hqOnly` as props. Apply filtering via shared helper. Add empty-state message distinguishing "no history" from "no history matching filters."
- **`PriceStats`**: Receives pre-filtered `sales` from `+page.svelte`. No prop changes — it already computes stats from whatever `sales` it receives.

### Empty state handling

When filters produce zero results, show "No [listings/sales] match the current filters" (extend ListingsTable's existing pattern to SaleHistoryTable).

### Scope boundaries

- Filters only affect Market tab sections. Crafting tab is unaffected (cross-world sourcing by design).
- Data fetching stays where it is (listings in `ListingsTable`, sales in `+page.svelte`).
- Filter state is ephemeral — no URL persistence, resets on navigation. Same as current behavior.
