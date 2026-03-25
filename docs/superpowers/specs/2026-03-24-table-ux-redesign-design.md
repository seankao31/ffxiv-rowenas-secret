# Table UX Redesign — Single-Row Layout

## Problem

The current OpportunityTable renders up to 3 rows per item:
1. **Main row** — core arbitrage data across 9 columns
2. **Alt row** — alternative source server (colspan 9, flat text)
3. **Detail row** — total velocity, tax, listing price (colspan 9, flat text)

The alt and detail rows dump secondary info as unstructured text that doesn't align with the columns it relates to. This creates visual clutter and breaks scannability.

## Design

Collapse all three rows into a **single row with two-line stacked cells**. Each column owns both its primary and secondary data.

### Column mapping

| Column | Primary (15px) | Secondary (11px, muted) |
|---|---|---|
| Item | Item name (link) | *(none)* |
| Buy from | Source world | Alt source world |
| Buy | Buy price + age | Alt buy price + alt age |
| Sell | Sell price + age | Listing price, no parenthetical explanation (only when ≠ sell, `#666`) |
| Profit/unit | Profit per unit | Tax amount |
| Units | recommended / available | *(none)* |
| Comp | Active competitors | *(none)* |
| Vel | Fair-share velocity | Total velocity (`fairShareVelocity * (activeCompetitorCount + 1)`) |
| Gil/day | Expected daily profit | Alt expected daily profit |

Secondary lines only render when they have data (e.g., no alt row if `altSourceWorld` is undefined, no listing line if `listingPrice === sellPrice`).

### Data age indicators

Replace the current `StaleBadge` component (emoji dot + text on a separate line) with **colored inline time text**:

- Green (`#5b5`) for confidence >= 0.85
- Yellow/amber (`#cb3`) for confidence >= 0.60
- Orange (`#e83`) for confidence >= 0.25
- Red (`#d44`) for confidence < 0.25

The time text sits inline to the right of its price, separated by a 10px gap.

### Price–time alignment

Prices within a column use:
- `font-variant-numeric: tabular-nums` for equal-width digits
- `width: 70px; text-align: right` on the price element (flex child, `flex-shrink: 0`)
- The age text follows as the next flex child

This guarantees vertical alignment of age text across all rows in the same column.

### Typography

- Primary data: **15px**, color `#ccc`
- Secondary data: **11px**, color `#888` (alt values) or `#666` (metadata like tax, listing, total vel)
- Table headers: **12px**, color `#777`

### Spacing

- Cell padding: `12px 14px`
- Header padding: `10px 14px`
- Gap between primary and secondary lines: `5px` (via `margin-top`)
- Gap between price and age text: `10px` (via flex `gap`)

### Layout structure per price cell

```html
<td>
  <div class="price-line">           <!-- display:flex; align-items:baseline; gap:10px -->
    <span class="val">40,916</span>  <!-- width:70px; text-align:right; flex-shrink:0 -->
    <span class="age">1.9h ago</span><!-- font-size:11px; color by confidence -->
  </div>
  <div class="alt-line">             <!-- same flex layout, margin-top:5px -->
    <span class="val">45,880</span>  <!-- font-size:11px; color:#888 -->
    <span class="age">12min ago</span>
  </div>
</td>
```

### What gets removed

- **`StaleBadge` component** — replaced by inline colored age text
- **Expanded row state** — no more `expanded` Set, no click-to-expand
- **Alt sub-row** — absorbed into main row cells
- **Detail sub-row** — absorbed into main row cells

### What stays the same

- Table headers (same 9 columns)
- Sort behavior (if any)
- Item name as Universalis link
- All *currently displayed* data is preserved — internal fields like `score`, `sourceWorldID`, `altSourceWorldID` remain used for sorting/logic but are not shown (same as before)
- Age formatting logic (`ageHours < 1 ? Xmin ago : X.Xh ago`) is retained
- `fmt` number formatting helper and `resolveItemName` with `nameGeneration` reactivity are unchanged
- Row hover highlight (`background: #1e2240`) is kept for scannability, but cursor changes from `pointer` to `default` since rows are no longer clickable

## Files to modify

- `src/client/components/OpportunityTable.svelte` — main table component (template, styles, remove expand logic)
- `src/client/components/StaleBadge.svelte` — can be deleted or replaced with a simple helper function for color mapping

## Mockups

Visual mockups from the brainstorming session are saved in `.superpowers/brainstorm/` — the final approved version is `spacing-alignment-v4.html`.
