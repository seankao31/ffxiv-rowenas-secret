# External Reference Links on Item Detail Page

## Summary

Add right-aligned text links in the item detail header row pointing to external FFXIV data sites. Links serve as secondary references — visible but not competing with the page's primary content.

## Design

### Placement

Right-aligned in the existing item header flex row (`ml-auto`), sitting opposite the icon/name/badge on the left. Small muted text with `·` separators.

### Links (v1)

| Site | URL Pattern |
|------|-------------|
| Universalis | `https://universalis.app/market/{itemID}` |
| Garland Tools | `https://www.garlandtools.org/db/#item/{itemID}` |
| Teamcraft | `https://ffxivteamcraft.com/db/en/item/{itemID}/` |

All links open in new tabs (`target="_blank"` with `rel="noopener"`).

### Visual Style

- Small text (`text-xs` or `text-sm`), muted color (`text-base-content/40`), brightens on hover
- Separated by `·` (middle dot)
- On mobile, wraps below the item name naturally via flex-wrap

### Scope

Inline edit to `src/routes/item/[id]/+page.svelte` only. No new components or modules.

## Follow-Up Tickets

1. **Add 灰機 wiki link** — Requires Simplified Chinese item name lookup (not a simple Traditional-to-Simplified character transform; translations differ). Needs a data pipeline for SC names.
2. **Add Saddlebag Exchange link** — `https://saddlebagexchange.com/queries/item-data/{itemID}`. Market data doesn't include TC (陸行鳥) servers, but their sales statistics and history are useful as reference.

## Linear

Completes ENG-63 (Link arbitrage table to item detail). The arbitrage table already links to `/item/{id}` internally; this adds the secondary external links on the item detail page.
