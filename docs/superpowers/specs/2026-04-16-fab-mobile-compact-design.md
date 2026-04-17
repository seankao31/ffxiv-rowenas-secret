# FloatingActionBar mobile compaction (ENG-160)

## Problem

On the arbitrage page, `FloatingActionBar` is pinned at `fixed bottom-28` (112px from the viewport bottom) so it stays above the site footer when a user scrolls to the bottom of the page. On mobile — especially landscape, where the viewport is ~375px tall — that 112px offset plus the bar's own `py-4` padding and default-sized buttons consumes roughly a third of the visible page height.

The bar's content is also intrinsically wide (`3 items selected · Est. profit: 15,000 gil  [Clear]  [Plan Route]`), which can overflow narrow portrait viewports under `fixed left-1/2 -translate-x-1/2`.

The fix needs to:

1. Move the bar much closer to the viewport bottom on mobile.
2. Make the bar itself shorter and narrower on mobile.
3. Preserve current desktop appearance and the existing "no footer overlap" contract on desktop.

## Design

The app uses `lg:` (1024px) as its single mobile→desktop breakpoint. We keep that.

### Position

| Viewport | Current          | New              |
|----------|------------------|------------------|
| `< lg`   | `bottom-28` (112px) | `bottom-4` (16px) |
| `≥ lg`   | `bottom-28` (112px) | `bottom-28` (unchanged) |

On mobile, the site footer may temporarily sit underneath the FAB when the user scrolls to the very bottom of the page. This is acceptable: the footer is credits/attribution with no interactive elements. On desktop the existing footer-clearance behavior is preserved.

### Bar dimensions

| Property   | Current      | Mobile           | Desktop (unchanged) |
|------------|--------------|------------------|---------------------|
| Padding    | `px-6 py-4`  | `px-3 py-2`      | `lg:px-6 lg:py-4`   |
| Inner gap  | `gap-4`      | `gap-2`          | `lg:gap-4`          |
| Button size| default (`btn`) | `btn-sm`     | default (`lg:btn-md`) |

### Label density

Mobile content favors brevity over descriptive labels:

| Element         | Desktop                                 | Mobile                 |
|-----------------|-----------------------------------------|------------------------|
| Selection count | `3 items selected`                      | `3 items`              |
| Separator       | `·` (shown)                             | `·` (shown)            |
| Profit          | `Est. profit: 15,247 gil`               | `15.2K gil`            |
| Clear button    | `Clear`                                 | `Clear`                |
| CTA button      | `Plan Route`                            | `Plan Route`           |

Compact number formatting on mobile: `Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })` — e.g. `15,247` → `15.2K`, `1,250,000` → `1.3M`, `750` → `750`. Desktop keeps full-grouping locale formatting (`toLocaleString()`).

Visibility is controlled with responsive utility variants (`hidden lg:inline` / `inline lg:hidden`) inside the existing text spans. No layout restructure; the bar remains a single flex row.

### Out of scope

- Changing how the FAB interacts with the Buy Route modal (they already cooperate: FAB hides while modal is open).
- Re-architecting the FAB into a sticky-in-content element.
- Collapsing the info + CTAs into two stacked rows.
- Changing any desktop styling or the Buy Route modal itself.

## Testing

### Unit tests

No unit tests — the component is presentational; behavior is already exercised by e2e.

### E2E tests

**Existing desktop test, unchanged** (`tests/e2e/buy-route.desktop.test.ts`):
- `floating action bar does not overlap footer` — continues to pass because `lg:bottom-28` applies on the desktop viewport.

`playwright.config.ts` defines a `desktop` project (Desktop Chrome) and a `mobile` project (iPhone 14 portrait). There is no landscape project; one-off landscape assertions use `page.setViewportSize` inline to avoid config churn.

**New mobile tests** (`tests/e2e/buy-route.mobile.test.ts`):
1. `floating action bar sits near the viewport bottom on mobile` — the FAB's bottom edge is within 32px of the viewport bottom in the default (portrait) viewport.
2. `floating action bar stays near the viewport bottom in landscape` — same assertion after `page.setViewportSize({ width: 812, height: 375 })`.
3. `floating action bar uses compact profit format on mobile` — the rendered profit text uses `Intl` compact notation (the regex accepts either a raw digit block or a digit block followed by `K`/`M` with an optional decimal, e.g. `/^\d+(\.\d)?[KM]? gil$/`). Applies to the default (portrait) viewport.

### Visual verification

Screenshot the arbitrage page via the `playwright-cli` skill:

1. Desktop (≥1024px) — confirm FAB position + content unchanged.
2. Mobile portrait (e.g. 390×844) — confirm FAB sits near the bottom, fits within viewport width, shows `N items · X.XK gil` (or raw number if < 1000).
3. Mobile landscape (e.g. 812×390) — confirm FAB doesn't eat the viewport, still reads cleanly.

## Risks

- **Footer overlap on mobile at max scroll.** Users who scroll to the very bottom of the arbitrage page while having items selected will see the FAB overlap the site credits footer. Judged acceptable because the footer is non-interactive.
- **Compact number format unfamiliarity.** `15.2K gil` may feel less precise than `15,247 gil`. This is mobile-only; users who need exact values can open the modal (which shows full precision).

## Implementation surface

Single file: `src/lib/components/FloatingActionBar.svelte`. Class changes plus a small helper for compact number formatting. Plus the new mobile e2e assertions.
