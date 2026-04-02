# Item Icons via XIVAPI v2

## Problem

The opportunity table shows item names as plain text. Adding item icons improves scannability and visual identification.

Additionally, the existing `item-names.ts` module uses the deprecated XIVAPI v1 endpoint (`xivapi.com/item/{id}?columns=Name`) with individual per-item requests. This should be migrated to v2.

## Design

### Data source

XIVAPI v2 (`v2.xivapi.com`) provides two relevant endpoints:

- **Sheet endpoint** — `GET /api/sheet/Item?rows={id1},{id2},...&fields=Icon,Name` returns both the English name and icon metadata for multiple items in a single request. The `Icon` field contains `{ id, path, path_hr1 }` where `path_hr1` is the high-res game texture path.

- **Asset endpoint** — `GET /api/asset?path={path}&format=webp` converts the game texture to a browser-renderable image.

No `language` parameter is needed (English is the default). Chinese names come from the existing TW msgpack source, not XIVAPI. The `chs`/`cht` language codes are listed in the OpenAPI spec but rejected by the live API.

### Architecture

Client-side only. No server changes.

**Unified fetch module** — Replace `src/client/lib/item-names.ts` with `src/client/lib/xivapi.ts`. The module exposes a batch-oriented function (e.g., `fetchItemMetadata(itemIDs: number[])`) called when opportunities change. The function:

1. Filters to IDs not already in the cache.
2. If there are uncached IDs, makes a single batched `GET /api/sheet/Item?rows=...&fields=Icon,Name` call.
3. Stores results in a `Map<number, { name?: string, iconPath?: string }>`.
4. Invokes an `onChange` callback (same pattern as current `item-names.ts`) to trigger a Svelte re-render.

The module also exposes per-item accessors (e.g., `resolveItemName(id, serverName)` and `getIconUrl(id)`) that read from the cache for use during rendering.

Icon URLs are constructed as needed: `https://v2.xivapi.com/api/asset?path=${iconPath}&format=webp`, using the standard-res `path` (not `path_hr1`) since icons display at ~20px where high-res is unnecessary overhead.

The cache persists across re-renders. Subsequent opportunity refreshes only fetch newly-appearing item IDs. With a max of 200 items and ~6 chars per ID, the `rows` query string stays well under URL length limits.

**Name resolution** — The English `Name` from v2 is only used as a fallback when the server-provided `itemName` matches the `Item #NNN` pattern (same behavior as today). Items with TC Chinese names from the msgpack source are displayed as-is. The scope change is that all items now hit v2 for icon metadata, but only fallback-pattern items consume the English name.

**Icon rendering** — In `OpportunityTable.svelte`, add a ~20px `<img>` with explicit `width`/`height` attributes (to prevent layout shift) to the left of each item name. The image loads directly from XIVAPI's asset endpoint. If the icon URL isn't resolved yet, just show the name without an icon — no placeholder needed.

**Error handling** — On metadata fetch failure, log a warning and leave cache entries empty; names and icons degrade gracefully (name shows whatever the server provided, icon simply doesn't appear). Add an `onerror` handler on `<img>` elements to hide them if the asset fails to load.

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
- Update ADR-007 with an addendum noting the v1 → v2 migration
