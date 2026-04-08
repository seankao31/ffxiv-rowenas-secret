# Item Detail Route and Layout

**Linear:** ENG-60
**Date:** 2026-04-08
**Status:** Approved

## Overview

Create `/item/[id]` route — the detail page for a single market board item. Shows item identity (icon, names, ID) and provides a sectioned layout for market data that will be populated by follow-up issues.

## Route

`/item/[id]` where `[id]` is a Universalis item ID (integer).

Uses the existing `+layout.svelte` shell (sidebar, topbar, footer).

## Data Flow

### Server-side (`+page.server.ts`)

- Validates `[id]` parameter as a positive integer; returns 400 on invalid input
- Returns the TW Chinese name from server `nameCache` (loaded from `tw-items.msgpack` at startup), or `null` if not found
- Minimal load function (~5 lines) — no Universalis calls server-side

### Client-side

- Fetches item icon and English name via existing `fetchItemMetadata()` + `getIconUrl()` from `$lib/client/xivapi.ts`
- Universalis market data fetching is stubbed for this issue; real data comes in follow-up issues
- No polling needed for this issue (unlike arbitrage page)

## Layout

Top-to-bottom, single page scroll:

### 1. Item Header (full width)

- 40x40 item icon from XIVAPI (skeleton shimmer while loading)
- TW Chinese name as primary text (`text-lg font-bold`)
- English name as secondary text (`text-sm text-base-content/50`)
- Item ID displayed as a subtle badge (`badge badge-soft`)
- Loading state: `skeleton` class on icon and name elements

### 2. Listings | History (two-column)

- CSS Grid: `grid grid-cols-1 lg:grid-cols-2 gap-4`
- **Left:** "Cross-World Listings" — DaisyUI `card bg-base-200` with `card-title` and skeleton placeholder lines in body
- **Right:** "Sale History" — same card treatment
- Stacks to single column on narrow viewports

### 3. Price Statistics (full width)

- Single `card bg-base-200` spanning full width below the two-column row
- `card-title` + skeleton placeholder lines
- Will hold price chart and statistics in follow-up issues

## Error States

| Condition | Behavior |
|-----------|----------|
| Non-integer `[id]` | `+page.server.ts` returns 400; page shows error message |
| TW name not in server cache | English name from XIVAPI used as primary; if both missing, `Item #<id>` fallback |
| XIVAPI icon fetch fails | No icon displayed; graceful degradation |

## Navigation

No sidebar entry — item detail is reached via direct URL or future item search/link from arbitrage table. Not a top-level nav destination.

## References

- [universalis.app/market/2394](https://universalis.app/market/2394) — two-column listings + history layout
- [FFXIV_Market/item/2394](https://beherw.github.io/FFXIV_Market/item/2394) — two-column listings + history layout

## Out of Scope

- Actual listings data (follow-up issue)
- Actual sale history data (follow-up issue)
- Price chart / statistics (follow-up issue)
- Item search / navigation to this page (separate feature)
- World tabs / per-world filtering (follow-up issue)
