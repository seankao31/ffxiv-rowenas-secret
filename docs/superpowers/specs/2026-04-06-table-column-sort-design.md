# Table Column Sort (Client-Side)

**Linear:** ENG-46
**Date:** 2026-04-06

## Overview

Add clickable column headers to `OpportunityTable.svelte` that sort the displayed opportunities client-side. Default sort remains by score (current API order). Pure frontend — no backend or type changes needed.

## Sortable Columns

Only key decision-making columns are sortable, using primary row values only (secondary/alt rows are not sort targets):

| Header     | Sort field               | Default direction          |
|------------|--------------------------|----------------------------|
| Profit/unit| `profitPerUnit`          | desc (highest first)       |
| Comp       | `activeCompetitorCount`  | asc (fewest first)         |
| Vel        | `fairShareVelocity`     | desc (highest first)       |
| Gil/day    | `expectedDailyProfit`    | desc (highest first)       |

Non-sortable columns: Item, Buy from, Buy, Sell, Units.

## Sort Behavior

- **Default state:** No column active — rows displayed in API order (score descending).
- **First click:** Sorts by that column in its default direction.
- **Second click:** Reverses direction.
- **Third click:** Clears sort, returns to score order.
- **Single-column sort only** — no multi-column sort.
- **Tie-breaking:** When two rows share the same value for the sorted column, ties are broken by `score` descending.
- **Data refresh:** Sort state persists across prop updates. When `opportunities` changes (new scan data every 30s), the current sort is re-applied to the new data via the `$derived`.

## Visual Indicators

Icons from `lucide-svelte` (already a project dependency):

- **Inactive sortable column:** `ArrowUpDown` icon — subtle indicator that the column is sortable. `cursor: pointer`.
- **Active ascending:** `ArrowUp` icon.
- **Active descending:** `ArrowDown` icon.
- **Non-sortable columns:** No icon, no cursor change. Unchanged from current.

Existing `{@render infoIcon()}` tooltips on headers remain as-is; sort icons sit alongside them.

## Implementation Approach

All changes are scoped to `OpportunityTable.svelte`. No changes to `+page.svelte`, `api.ts`, types, or any other file.

### State

Two reactive variables:

- `sortColumn`: `'profitPerUnit' | 'activeCompetitorCount' | 'fairShareVelocity' | 'expectedDailyProfit' | null` — `null` means default score order.
- `sortDirection`: `'asc' | 'desc'`.

### Derived Sorted List

A `$derived` that:
- When `sortColumn` is `null`: returns the original `opportunities` array (score order).
- When `sortColumn` is set: returns a sorted copy using the selected field and direction, with `score` descending as tiebreaker.

### Click Handler

A single `toggleSort(column)` function implementing the three-click cycle:
1. If clicking a different column → set to that column's default direction.
2. If clicking the active column in default direction → reverse.
3. If clicking the active column in reversed direction → clear (`sortColumn = null`).

### Header Markup

Sortable `<th>` elements get `onclick={toggleSort(column)}`, `cursor: pointer`, and render the appropriate lucide icon based on active state. Non-sortable `<th>` elements are unchanged.

## Testing

- Sort toggles through three-click cycle (default → reverse → clear) for each sortable column.
- Clicking a different column switches sort target and resets to that column's default direction.
- Tie-breaking by score works correctly.
- Non-sortable columns are not clickable and show no sort indicators.
- Sort state resets appropriately when the `opportunities` prop updates with new data.
