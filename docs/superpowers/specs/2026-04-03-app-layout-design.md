# App Layout & Navigation — Design Spec

**Date:** 2026-04-03
**Status:** Draft

## Overview

Introduce a persistent app shell with top bar, collapsible sidebar navigation, and ad zone to support the growing tool suite. The arbitrage tool becomes the first page within this shell; future tools slot in without layout changes.

## Motivation

The app currently renders a single full-page arbitrage view with no navigation. As the tool suite grows (crafting optimizer, price alerts, gathering guides, etc.), users need a way to discover and switch between tools. Additionally, the layout must accommodate ad placements for revenue without competing with the data-dense content area.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Top bar (full width, fixed height 48px)                        │
│  羅薇娜的商業機密 / {Tool Name}                 [Login/Profile] │
├────────┬────────────────────────────────────────────────────────┤
│        │  Ad zone (leaderboard, responsive)                     │
│ Side- [>]───────────────────────────────────────────────────────│
│  bar   │  Tool content area                                     │
│        │  (each tool owns this space entirely)                  │
│        │                                                        │
│        │                                                        │
├────────┴────────────────────────────────────────────────────────┤
│  Footer (full width)                                            │
└─────────────────────────────────────────────────────────────────┘
```

`[>]` = edge-mounted toggle button (see Sidebar section)

### Top Bar

- Spans the full viewport width, always at the top
- Never affected by sidebar expand/collapse — completely independent
- Height: 48px
- Contents:
  - **Left:** App title `羅薇娜的商業機密` + separator + current tool name (breadcrumb style)
  - **Right:** Login/profile area (user display name, avatar)
- Background: `base-200` (DaisyUI surface), border-bottom for separation

### Sidebar

The sidebar sits **below** the top bar on the left. It toggles between two states:

**Expanded (default for new visitors):**
- Width: ~220px
- Flat navigation list with icons + text labels (category grouping not yet implemented)
- Active tool highlighted with accent-color left border + background tint
- Icons from lucide-svelte (already used in the project)
- Scrollable if tools exceed viewport height

**Collapsed:**
- Width: ~56px (icon rail)
- Icons only, vertically stacked
- Tooltip on hover shows tool name
- Active tool icon highlighted with accent background

**Toggle button:**
- Edge-mounted: a small circular button (~28px) positioned on the sidebar's right border, vertically near the top
- Absolutely positioned, z-indexed above the sidebar border — sits half on the sidebar, half on the content area
- Displays `ChevronLeft` (to collapse) or `ChevronRight` (to expand) from lucide-svelte
- Visible on hover near the sidebar edge (optional: always visible is also acceptable)
- Does not consume any space inside the sidebar — the nav list gets 100% of the sidebar's vertical space

**Behavior:**
- Two states only — no hover-to-expand (avoids accidental triggers near the table)
- Toggle preference persisted in `localStorage`
- Default state for new visitors: **expanded**
- Background: same surface color as the top bar (`base-200`), separated from content by a right border

### Ad Zone

- Positioned at the top of the content area, below the top bar, to the right of the sidebar
- Leaderboard format (responsive — Google Ads auto-sizes to the container)
- Independent of both navigation and content — scales freely as tools or nav items grow
- The ad zone width adjusts with sidebar state (wider when sidebar is collapsed)
- A designated container `<div>` that can later receive the Google AdSense script

### Content Area

- Fills all remaining space to the right of the sidebar and below the ad zone
- Each tool owns this area entirely — the shell provides no inner structure
- Content retains the existing `max-w-[1400px]` horizontal constraint with auto margins and horizontal padding — this applies within the content area only (the top bar and sidebar are full-width/full-height respectively)
- For the arbitrage tool, this area contains: StatusBar, ThresholdControls, OpportunityTable (same as today, minus the current header/footer)

### Footer

- Spans full viewport width, below the sidebar + content area — mirrors the top bar
- Never affected by sidebar expand/collapse
- Retains existing content: "Built with ♥ by Yshan", Universalis attribution, Square Enix legal notice
- Scrolls with page content — not sticky

---

## Theme

- **Dark mode only** (no light mode toggle)
- Base: DaisyUI `night` theme
- Custom brand accent: gold/gilt tone (approximately `#d4af60`) replacing the default DaisyUI accent
- The gold accent is used for: active nav item highlight, app title, sidebar toggle hover state, and any brand emphasis
- All existing component colors (staleness indicators, link colors, table hover states) remain unchanged

---

## Component Breakdown

### New Components

**`AppShell.svelte`** — the root layout component. Owns:
- Top bar rendering
- Sidebar state (`expanded: boolean`, persisted to localStorage)
- Sidebar toggle logic
- Ad zone container
- Slot/child for the active tool's content

**`Sidebar.svelte`** — the collapsible sidebar. Props:
- `expanded: boolean`
- `ontoggle: () => void`
- Navigation items (can be hardcoded initially, made dynamic later)
- Renders either the full nav list or icon rail based on `expanded`
- Owns the edge-mounted toggle button (absolutely positioned on its right border)

**`TopBar.svelte`** — the top bar. Props:
- `currentTool: string` (displayed in breadcrumb)
- Login/profile state (placeholder for now — can be a static display or slot)

### Modified Components

**`App.svelte`** — currently the root component. Becomes the arbitrage tool page:
- Remove the `<header>` (title moves to TopBar)
- Remove the `<footer>` (moves to AppShell or stays as a shared component)
- Remove the outer `flex flex-col h-screen` wrapper (AppShell handles viewport layout)
- The component focuses purely on the arbitrage tool: StatusBar, ThresholdControls, OpportunityTable

### Unchanged Components

- `StatusBar.svelte` — no changes
- `ThresholdControls.svelte` — no changes
- `OpportunityTable.svelte` — no changes

---

## Navigation Items

For the initial implementation, only one tool exists. The sidebar renders a flat list:

```
  ● Arbitrage        (active)
```

Category grouping (e.g., "Trading", "Crafting", "Gathering") is defined in the `NavItem` data model (`category` field) but not yet rendered in the sidebar UI. Category headers should be added when the tool list grows large enough to benefit from grouping.

Future tools are added by adding entries to the nav item list. No dynamic routing is needed in this phase — the sidebar visually shows only the arbitrage tool, with no other clickable items.

When a second tool is added, client-side routing (SvelteKit or equivalent) will be introduced at that time. The shell is structured to support this without layout changes.

---

## Responsive Behavior

Not in scope for this phase. The app targets desktop usage (FFXIV players on a second monitor). The layout assumes a minimum viewport width of ~1024px. Mobile layout optimization is deferred per the original design spec's "Out of Scope" section.

---

## Implementation Scope

This spec covers the structural layout change only:

**In scope:**
- AppShell, TopBar, Sidebar components
- Sidebar expand/collapse with localStorage persistence
- Moving existing header/footer content into the new shell
- Ad zone container (empty div, no ad provider integration)
- Custom gold accent color in DaisyUI theme
- Refactoring App.svelte into a tool page within the shell

**Out of scope:**
- Client-side routing (added when second tool ships)
- Login/auth implementation (profile area is a placeholder)
- Google AdSense integration (container only)
- Light mode
- Mobile layout
- Any changes to the arbitrage tool's functionality
