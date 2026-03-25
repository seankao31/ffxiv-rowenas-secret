# Switch Item Name Source from Mogboard to FFXIV_Market

**Date:** 2026-03-25
**Status:** Draft

## Problem

The current item name source — mogboard-next's `tc/items.json` — contains ~15,555 TC Chinese item names. While sufficient for today's marketable-item-only use case, it is:

- **Incomplete:** Only covers items that exist on the TC server's current patch, missing items that may be needed for future features (e.g., crafting cost lookups for non-marketable materials).
- **Infrequently updated:** Depends on mogboard maintainers pushing changes.
- **Large payload:** ~5 MB JSON for just the name field.

## Solution

Switch to [`beherw/FFXIV_Market`](https://github.com/beherw/FFXIV_Market)'s `tw-items.msgpack` as the item name source.

**New source characteristics:**
- **43,158 items** (vs 15,555) — covers essentially all game items, not just TC-patch-current ones
- **1.3 MB msgpack** (vs ~5 MB JSON) — smaller payload, faster to parse
- **More frequently updated** — uses a multi-source pipeline (`resolve-tw-json.js`) that pulls from dataminer output first, then falls back to Teamcraft data
- **Same data quality** — TC Chinese names keyed by item ID, same as mogboard

**URL:**
```
https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack
```

**Data shape (after decode):**
```typescript
Record<string, { tw: string }>
// e.g. { "2": { "tw": "火之碎晶" }, "7": { "tw": "水之碎晶" }, ... }
```

## Scope of Changes

### 1. New dependency: `@msgpack/msgpack`

Added to `dependencies` in `package.json`. Used server-side to decode the binary msgpack response. This is a pure JS/TS package with no native dependencies, so Bun compatibility is expected.

### 2. `src/server/universalis.ts` — `fetchItemNames()`

The function signature remains `Promise<Map<number, string>>`. Internal changes:

- **URL constant:** `MOGBOARD_ITEMS_URL` → new GitHub raw URL for `tw-items.msgpack`
- **Import:** `import { decode } from '@msgpack/msgpack'`
- **Response decoding:** `res.json()` → `decode(new Uint8Array(await res.arrayBuffer()))`
- **Field access:** `item.name` → `item.tw`
- **Guard against bad data:** Skip entries where `item.tw` is falsy, so they fall through to the `Item #NNN` client-side fallback instead of producing blank names.
- **Error handling:** Wrap `decode()` and `res.arrayBuffer()` in the existing try/catch so a corrupt payload returns an empty map with a warning, consistent with the fetch-error behavior.
- **Log message:** Updated to reflect new source name and expected item count

No changes to callers (`scanner.ts`, `cache.ts`, `scoring.ts`, `api.ts`).

### 2b. `src/server/scanner.ts` — comment cleanup

Line 222 comment currently says "mogboard's TC data" — update to reflect the new source.

### 3. `tests/server/universalis.test.ts` — `fetchItemNames` tests

- Mock data shape changes from `{ name: string }` to msgpack-encoded `{ tw: string }`
- Mock response changes from `JSON.stringify(mockData)` to `encode(mockData)` bytes
- Assertions unchanged (still checks `map.get(2) === '火之碎晶'`)

### 4. `docs/decisions/ADR-007-item-name-resolution.md`

Updated to document the source switch: new URL, msgpack format, rationale for the change, and the added dependency.

### Not changed

- **`src/client/lib/item-names.ts`** — English fallback still triggers on `Item #NNN` pattern. With 43k names, it fires even less often.
- **`src/server/cache.ts`** — Still stores `Map<number, string>`, no structural change.
- **`src/server/scoring.ts`** — Still reads from the name map via `nameMap.get(itemID)`.

## Decision: Load all 43k names

The new source includes non-marketable items (quest items, key items, etc.) that the current scanner never prices. We load all of them because:

- Memory cost is negligible (~2 MB for a `Map<number, string>` of 43k entries on a single-machine personal tool)
- Future features (e.g., crafting cost lookups) may need names for non-marketable items
- Filtering to marketable-only would add complexity for no practical benefit

## Risks

- **Upstream repo disappears or restructures:** Same risk as mogboard. Mitigated by the existing fallback to `Item #NNN` and runtime logging of item count at startup.
- **msgpack format changes:** The `{ tw: string }` shape is simple and stable. If it changes, decode will fail visibly and fall back to empty map.
