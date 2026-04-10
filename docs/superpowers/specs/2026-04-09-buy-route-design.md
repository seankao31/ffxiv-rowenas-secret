# Buy Route — Cross-World Shopping List

**Linear:** ENG-55
**Project:** Arbitrage
**Date:** 2026-04-09

## Problem

The arbitrage table shows opportunities sorted by profitability. Items from the same source world are scattered across rows, making it easy to miss items while visiting a world — resulting in unnecessary back-and-forth travel between worlds.

## Solution

A selection-based buy route that groups selected opportunities by source world into a shopping list modal. The user selects items from the arbitrage table, clicks "Plan Route," and gets a world-grouped checklist they can follow while shopping in-game.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Entry point | Selection on existing table | Simpler than a toggle mode; user explicitly chooses items to buy |
| Selection UX | Click-zone (row body = select, item name = navigate) | No checkboxes, no toggle mode. Clean table, always available. Follows GitHub/Linear pattern |
| Route view | Full-screen modal overlay | Simple to build; avoids layout issues with wide table. Can revisit as panel later |
| Algorithm | Client-side grouping | Opportunity type already has primary + alt source. No new API calls needed |
| Alt handling | Always show alt entries | Alt-only world groups shown dimmed at bottom. Handles stale-data fallback |
| Item states | Three states: unchecked, bought, missing | Missing state promotes linked alt with warning |
| State persistence | Browser session only | Not persisted across page refresh. Sufficient for single shopping runs |
| Sort within worlds | By score descending | Reuses existing scoring (confidence-weighted profitability) |
| World group sort | By primary item count descending | Most efficient stops first. Alt-only groups last |
| Future extensibility | Route builder is decoupled | Crafting optimizer can feed items into the same route system later |

## Selection Mechanism

### Click Zones

The arbitrage table uses click zones to separate selection from navigation:

- **Item name** (styled as underlined link): navigates to `/item/[id]`
- **Anywhere else on the row**: toggles row selection

Interactive elements within the row (copy button, sort headers) use `stopPropagation` to prevent accidental selection.

### Visual Feedback

- **Selected row**: 3px purple left border + subtle purple background tint
- **Unselected row**: 3px transparent left border (consistent layout, no shift)

### Floating Action Bar

Appears fixed to the bottom of the viewport when >= 1 item is selected:

- Left: "{N} items selected · Est. profit: {sum of profitPerUnit × recommendedUnits}"
- Right: "Clear" button, "Plan Route" button (purple, primary action)

Selections are client-side state (Svelte rune). Clearing or navigating away resets them. The floating action bar is hidden while the route modal is open. Closing the modal preserves selections so the user can add more items and reopen.

## Route Modal

### Header

- **Title**: "Buy Route" (prominent, 18px)
- **Summary line**: "{N} items · {M} worlds · Est. profit: {total} gil"
- **Close button**: top-right ✕

### World Groups

Each group has a header bar showing:

- World name + item count
- Subtotal estimated profit (hidden when all items are done)
- "✓ done" badge when all items in the group are bought or marked missing

Groups are ordered:
1. Primary groups (have at least one primary item) — sorted by primary item count descending
2. Alt-only groups — sorted by item count descending, visually dimmed

### Item Rows

Each item row shows:

| Element | Description |
|---------|-------------|
| Checkbox area | Visual state indicator (empty, ✓ purple, ✕ red, — gray) |
| Item icon + name | With copy button (copies name for in-game market board search) |
| Primary/alt badge | Orange "alt" badge for alt entries; primary entries have no badge |
| Alt context line | For alt items: "Primary: {world} at {price} · here: {price} (+N%)" |
| Quantity | "×{recommendedUnits}" |
| Price | Per-unit buy price, colored by confidence |
| Confidence | "fresh" (green), "{N}h old" (yellow/orange), "stale" (red) |
| Missing button | Small ✕ button to mark item as absent. Only visible on unchecked items |

### Three Item States

**Unchecked** (default):
- Empty checkbox border
- Full opacity
- Copy button and confidence badge visible
- ✕ (missing) button visible at row end
- Click row body → bought

**Bought**:
- Purple checkbox with ✓
- Line-through on item name, reduced opacity (0.45)
- Copy button and confidence badge hidden
- ✕ button hidden
- Linked alt dismissed with "Bought on {world}" subtext
- Click row body → unchecked (reverses)

**Missing**:
- Red checkbox with ✕, "missing" badge
- Line-through on item name, reduced opacity (0.45)
- Linked alt promoted: full opacity, orange left border, warning text "⚠ Missing on {world} — available here at {price} (+N%)"
- Click ✕ button again → unchecked (reverses, alt returns to default state)

### Linking Rules

Primary and alt entries for the same item are linked:

- Checking primary as **bought** → alt dismissed ("Bought on {world}")
- Checking alt as **bought** → primary dismissed ("Bought on {world}")
- Marking primary as **missing** → alt promoted with warning
- Marking alt as **missing** → no special behavior (item has no further fallback)
- Unchecking any state reverses the linked effect

## Route Grouping Algorithm

Client-side function that transforms `Opportunity[]` into grouped route data:

1. **Group by primary source world**: each opportunity placed under its `sourceWorld`
2. **Attach alt entries**: for each selected opportunity, if `altSourceWorld` exists and `altSourceWorld !== sourceWorld`, create an alt entry under the alt world's group (creating a new alt-only group if needed)
3. **Sort world groups**: primary groups first (by primary item count desc), then alt-only groups (by item count desc)
4. **Sort items within groups**: by `score` descending. Primary items before alt items

Edge case: if `sourceWorld === altSourceWorld`, skip the alt entry.

## Data Requirements

All data comes from existing `Opportunity` fields — no new API calls:

- `itemID`, `itemName`: identification
- `sourceWorld`, `sourceWorldID`: primary buy location
- `altSourceWorld`, `altBuyPrice`: alternative buy location
- `buyPrice`: primary buy price (effective, includes tax)
- `recommendedUnits`: quantity to buy
- `score`: sort order within world groups
- `sourceDataAgeHours`, `sourceConfidence`: confidence display

## Out of Scope (v1)

- **Sell-side grouping**: arbitrage always sells on home world (利維坦), nothing to group
- **World consolidation optimization**: reassigning items to alt worlds to reduce total stops (future — configurable tradeoff "within N%")
- **Server-side route building**: full listing data for > 2 sources per item
- **Persistent state**: cross-session route resumption
- **Crafting ingredient integration**: future consumer of the same route builder
