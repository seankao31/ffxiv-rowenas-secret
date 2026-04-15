# Mobile Layout for Listings Section

**Linear:** ENG-145  
**Status:** Design approved

## Problem

The item detail page uses a viewport-constrained flex layout (`h-screen overflow-hidden`) with a `min-h-0` / `overflow-auto` chain to keep the footer in-viewport while listings and sale history scroll independently. On mobile (390px), the stacked single-column layout leaves too little vertical space for the constrained scroll areas — the `listings-scroll-container` is effectively hidden.

## Approach

Switch to natural page scrolling on mobile (<lg breakpoint), with row-capped tables and progressive "Show more" pagination to keep the page scannable.

Desktop layout is unchanged.

## Design

### 1. Layout mode switch

In `+layout.svelte`, the root container changes from unconditional `h-screen overflow-hidden` to:

- **Mobile (<lg):** `min-h-screen` with natural overflow — the page scrolls like a normal document.
- **Desktop (≥lg):** `h-screen overflow-hidden` — viewport-constrained as today.

Concretely: `class="flex flex-col h-screen overflow-hidden"` → `class="flex flex-col min-h-screen lg:h-screen lg:overflow-hidden"`.

The `min-h-0` chain on inner flex containers (content wrapper, card bodies, etc.) is harmless on mobile — it doesn't break natural flow, it just stops being the height-constraint mechanism.

### 2. Row cap with "Show more"

Both `ListingsTable` and `SaleHistoryTable` get progressive row pagination on mobile:

- **Initial cap:** 10 rows visible.
- **"Show more" button** appears below the table when more rows exist beyond the visible set.
- **Each click adds 10 rows** (10 → 20 → 30 → ...).
- **Button text:** "Show more (N remaining)" to communicate how much data is left.
- **When all rows are visible**, the button disappears.
- **Cap only applies below `lg`** — desktop tables render all rows (they scroll in constrained containers).

**Implementation:** Use a reactive `visibleCount` state variable. Slice the filtered array in `{#each}` to `filteredItems.slice(0, visibleCount)`. Detect the breakpoint via `matchMedia('(min-width: 1024px)')` to decide whether to apply the cap.

### 3. Scroll containers on mobile

The `listings-scroll-container` and `history-scroll-container` divs keep their existing classes (`flex-1 overflow-auto min-h-0`). On mobile, with the parent chain no longer height-constrained, these become inert — tables render at their natural (capped) height. No conditional classes needed on the containers themselves.

### 4. Files changed

| File | Change |
|------|--------|
| `src/routes/+layout.svelte` | Conditional viewport constraint: `min-h-screen` on mobile, `h-screen overflow-hidden` at lg+ |
| `src/lib/components/ListingsTable.svelte` | Row cap + "Show more" pagination below lg |
| `src/lib/components/SaleHistoryTable.svelte` | Row cap + "Show more" pagination below lg |
| `tests/e2e/item-detail.mobile.test.ts` | New e2e test for mobile layout |

### 5. E2E testing

Existing `item-detail.desktop.test.ts` is unchanged.

New `item-detail.mobile.test.ts` (390px viewport) verifies:

- Tables render with capped rows (10 visible initially)
- "Show more" button is present and shows remaining count
- Clicking "Show more" reveals additional rows
- Footer is reachable by scrolling
- Price Statistics section is reachable

### 6. Out of scope

- Horizontal table overflow / column hiding on narrow screens (separate concern)
- Crafting tab mobile layout
- Collapsible sections or sub-tab approaches (considered and rejected during brainstorming)
