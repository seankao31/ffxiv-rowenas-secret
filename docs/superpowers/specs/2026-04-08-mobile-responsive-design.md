# ENG-48: Mobile-Responsive Layout Design

## Summary

Make the surrounding UI (TopBar, Sidebar, ThresholdControls, StatusBar, Footer) mobile-friendly, and improve the table experience on mobile with a sticky first column. One breakpoint at `lg` (1024px) separates mobile from desktop.

## Guiding Principles

- **Landscape = usable.** Most/all table columns visible without scrolling. No sidebar eating width.
- **Portrait = functional.** User can scroll horizontally through the table while the Item column stays pinned. All controls are touch-friendly.
- **Desktop = unchanged.** No regressions to the existing layout above 1024px.

## Breakpoint

Single breakpoint: **`lg` (1024px)**, Tailwind's built-in. No custom breakpoints.

| Device | Width | Layout |
|--------|-------|--------|
| Phone portrait | ~375px | Mobile |
| Phone landscape | ~667-926px | Mobile |
| Tablet portrait | ~768px | Mobile |
| Tablet landscape / laptop | 1024px+ | Desktop |

Easy to change later — swapping `lg:` to `md:` across components if needed.

## Component Changes

### 1. Layout Shell (`+layout.svelte`)

**Desktop (≥1024px):** No change. Sidebar + content area as today.

**Mobile (<1024px):**
- Sidebar is not rendered (conditional with Tailwind `hidden lg:flex` or equivalent)
- Content padding changes from `px-8` to `px-3 lg:px-8`
- A new `drawerOpen` state (separate from sidebar `expanded`) controls the mobile navigation drawer

### 2. TopBar (`TopBar.svelte`)

**Desktop:** No change.

**Mobile:**
- Hamburger button (☰) appears on the left, triggers navigation drawer
- Hamburger button is visible on mobile, `lg:hidden` on desktop
- App title stays (7 Chinese characters fits on mobile)
- Version number hides: `hidden lg:inline`

**Props change:** TopBar needs an `ontoggle` callback for the hamburger, or emits an event. Alternatively, the drawer state lives in the layout and TopBar receives an `onmenuclick` prop.

### 3. Navigation Drawer (new component: `NavDrawer.svelte`)

Slide-in overlay from the left side, mobile only.

- **Trigger:** Hamburger button in TopBar
- **Backdrop:** Semi-transparent overlay (`bg-black/50`) that closes drawer on tap
- **Panel:** Slides in from left, ~280px wide, `bg-base-200`, same nav items as Sidebar
- **Close on navigation:** Clicking a nav link closes the drawer
- **Animation:** `transition-transform duration-200` slide

Contains the same `navItems` list as Sidebar. Active state styling matches Sidebar's expanded style.

### 4. ThresholdControls (`ThresholdControls.svelte`)

**Desktop:** No change — `flex-wrap` horizontal layout.

**Mobile (when expanded):**
- Controls stack vertically: `flex flex-col lg:flex-row lg:flex-wrap`
- Each slider label gets full width (remove `min-w-40`, or override to `min-w-0` / `w-full` on mobile)
- Range + number input row stays horizontal within each control (full-width slider is better for touch)
- Checkbox and select sit in a row together at the bottom
- Padding adjusts: `px-3 lg:px-4`

### 5. StatusBar (`StatusBar.svelte`)

**Desktop:** No change.

**Mobile:**
- Padding: `px-3 lg:px-4`
- Text size stays `text-sm` — already compact

### 6. OpportunityTable (`OpportunityTable.svelte`)

**Both orientations:**
- Table container: `overflow-x-auto` (already has `overflow-y-auto`, need horizontal too)
- Item column (first `<th>` and first `<td>`): `sticky left-0 z-10` with `bg-base-200` (header) / `bg-base-100` (body rows) to prevent see-through
- Subtle right border on sticky column for visual separation: `border-r border-base-300`

**Landscape (~700-900px):** Most columns visible without scrolling. Sticky column is insurance.

**Portrait (~375px):** User scrolls horizontally. Item name always visible.

**Hover row background:** The sticky column's background needs to match the hover state. Use `group-hover` on `<tr>` to keep the sticky cell's background in sync.

### 7. Footer

**Mobile:** Padding adjusts from `px-8` to `px-3 lg:px-8`. No content changes. Footer is below the fold.

## What's NOT Changing

- No card/list view for the table — horizontal scroll is sufficient
- No column hiding/priority logic — all 9 columns remain
- No bottom tab bar — hamburger drawer handles navigation
- No custom breakpoints — using Tailwind's built-in `lg`
- Desktop layout is untouched above 1024px
- Sidebar component itself is unchanged — it's just conditionally rendered

## Testing Considerations

- Verify sticky column works with `table-pin-rows` (DaisyUI's sticky header). Both sticky header and sticky column means the top-left cell needs `z-20` to sit above both axes.
- Test drawer open/close with keyboard (Escape to close)
- Test ThresholdControls sliders are usable with touch (thumb-friendly targets)
- Verify `overflow-x-auto` on the table doesn't break the existing `overflow-y-auto` vertical scroll
- Test at 375px (iPhone SE), 390px (iPhone 14), 844px landscape, and 1024px+ desktop
