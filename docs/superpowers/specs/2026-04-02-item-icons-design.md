# Item Icons via XIVAPI v2

## Problem

The opportunity table shows item names as plain text. Adding item icons improves scannability and visual identification.

Additionally, the existing `item-names.ts` module uses the deprecated XIVAPI v1 endpoint (`xivapi.com/item/{id}?columns=Name`) with individual per-item requests. This should be migrated to v2.

## Design

### Data source

XIVAPI v2 (`v2.xivapi.com`) provides two relevant endpoints:

- **Sheet endpoint** — `GET /api/sheet/Item?rows={id1},{id2},...&fields=Icon,Name` returns both the English name and icon metadata for multiple items in a single request. The `Icon` field contains `{ id, path, path_hr1 }` where `path_hr1` is the high-res game texture path.

- **Asset endpoint** — `GET /api/asset?path={path_hr1}&format=webp` converts the game texture to a browser-renderable image.

No `language` parameter is needed (English is the default). Chinese names come from the existing TW msgpack source, not XIVAPI.

### Architecture

Client-side only. No server changes.

**Unified fetch module** — Replace `src/client/lib/item-names.ts` with `src/client/lib/xivapi.ts`. When a new set of opportunity item IDs arrives, the module:

1. Filters to IDs not already in the cache.
2. Makes a single batched `GET /api/sheet/Item?rows=...&fields=Icon,Name` call for uncached items.
3. Stores results in a `Map<number, { name?: string, iconPath?: string }>`.
4. Icon URLs are constructed as needed: `https://v2.xivapi.com/api/asset?path=${iconPath}&format=webp`.

The cache persists across re-renders. Subsequent opportunity refreshes only fetch newly-appearing item IDs.

This replaces the old v1 per-item name resolution entirely.

**Icon rendering** — In `OpportunityTable.svelte`, add a small (~20px) `<img>` element to the left of each item name in the Item column. The image loads directly from XIVAPI's asset endpoint (browser handles parallel loading and caching). If the icon URL isn't resolved yet, just show the name without an icon — no placeholder needed.

### Why client-side

- Follows the existing pattern (name resolution was already client-side)
- No additional outbound traffic from the EC2 server
- Icon images are static game data — browser caching is effective
- Batch fetching keeps it to 1 metadata API call per page load

### Why not xivapi-js

The library was considered but rejected (YAGNI). Our interaction is two URL patterns — a batched sheet read and an asset URL construction. The library adds bundle size for features we don't use.

### Format choice

WebP over PNG — smaller files, universal browser support, and XIVAPI supports it.

## Scope

- Rename `item-names.ts` → `xivapi.ts`, rewrite to use v2 batched endpoint for both names and icon paths
- Update `OpportunityTable.svelte` to render icons inline with item names
- Update imports in components that reference the old module
