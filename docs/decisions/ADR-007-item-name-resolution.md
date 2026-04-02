# ADR-007: Item Name Resolution — Mogboard TC Static Data

**Status:** Accepted
**Date:** 2026-03-24

## Context

The scanner fetches ~16,700 marketable item IDs from Universalis, but Universalis returns only numeric IDs — item names must be resolved from a separate source. Names are needed when constructing `Opportunity` objects for the frontend.

The 陸行鳥 Data Center is a Traditional Chinese (TC) server, so names should display in TC Chinese.

## Previous Approach

Individual xivapi calls per item (`GET https://xivapi.com/item/{id}?columns=Name`), throttled to ~20 req/s in a background loop. Problems:

- **~14 minutes** to resolve all names (16,700 items × 50ms delay)
- Returned **English** names, not TC Chinese
- Competed with market data fetches for the shared 8-connection pool
- Names appeared incrementally — items showed as "Item #12345" until their name resolved

## Decision

Fetch the [mogboard-next](https://github.com/Universalis-FFXIV/mogboard-next) TC item data as a single JSON file at startup:

```
GET https://raw.githubusercontent.com/Universalis-FFXIV/mogboard-next/main/data/game/tc/items.json
```

This is a ~5MB JSON file mapping item IDs to structured item data (name, icon, category, etc.). We extract only the `name` field into a `Map<number, string>`.

## Rationale

- **One request replaces ~16,700:** A single ~5MB fetch vs. 14 minutes of individual calls.
- **TC Chinese names:** The mogboard `tc/` directory contains Traditional Chinese game data matching our server's locale.
- **No rate limit contention:** Fetched from GitHub's CDN, not Universalis — no impact on scan throughput.
- **Coverage:** The TC server runs an older game version than global servers, so the TC data file (15,555 items) covers all items that actually exist on 陸行鳥. The ~1,200 "missing" items are from newer patches not yet deployed to TC.
- **No maintenance required:** Points to `main` branch, so updates from mogboard maintainers are picked up automatically on restart.

### Why not vendor the JSON into the repo?

Vendoring would eliminate the GitHub network dependency but require manual updates when mogboard's data changes. Given the TC server updates very infrequently (months between patches), the maintenance cost outweighs the reliability benefit for a personal tool.

## Client-Side English Fallback

Items without a TC name (e.g., from newer patches or if the mogboard fetch failed) display as `Item #12345` on the server side. The client lazily resolves English names for these items via xivapi:

```
GET https://xivapi.com/item/{id}?columns=Name
```

- **On-demand only:** Fetches are triggered during rendering, not at startup — most items have TC names and never hit xivapi.
- **Cached:** An in-memory `Map` prevents re-fetching the same item across re-renders and filter changes.
- **Non-blocking:** The table renders immediately with `Item #12345`, then swaps in the English name once the fetch resolves.

This keeps the original xivapi approach for the small number of items that actually need it, without the startup cost or rate limit contention of resolving all ~16,700 items.

## Consequences

- All item names are available **before the first scan starts** — no more incremental hydration.
- If GitHub is unreachable at startup, names fall back to `Item #${id}` (non-fatal).
- Items missing TC names get their English name resolved lazily on the client via xivapi.
- Names are in TC Chinese, matching the in-game locale for 陸行鳥 players.

## Update: Switched to FFXIV_Market msgpack (2026-03-25)

Replaced mogboard-next JSON with [`beherw/FFXIV_Market`](https://github.com/beherw/FFXIV_Market)'s `tw-items.msgpack`:

```
GET https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack
```

**Why:**
- **43,158 items** (vs ~15,555) — covers all game items, not just TC-patch-current
- **1.3 MB msgpack** (vs ~5 MB JSON) — smaller payload
- **More frequently updated** — multi-source pipeline (dataminer → Teamcraft fallback)

**Changes:**
- Added `@msgpack/msgpack` dependency for binary decoding
- `fetchItemNames()` now decodes msgpack and reads `item.tw` instead of `item.name`
- Entries with falsy `tw` values are skipped (fall through to `Item #NNN` fallback)
- Decode errors return an empty map with a warning, consistent with fetch-error handling

## Update: Migrated client-side fallback to XIVAPI v2 (2026-04-02)

Replaced per-item XIVAPI v1 calls (`xivapi.com/item/{id}?columns=Name`) with a single batched XIVAPI v2 call:

    GET https://v2.xivapi.com/api/sheet/Item?rows={id1},{id2},...&fields=Icon,Name

**Why:**
- **One request replaces N:** Batch all item IDs into a single call instead of one per fallback item
- **Icon support:** The same call retrieves icon paths (used to display item icons in the opportunity table)
- **v1 deprecation:** XIVAPI v1 is deprecated in favor of v2

**Changes:**
- `item-names.ts` replaced by `xivapi.ts` which handles both name resolution and icon URL construction
- Icons rendered as `<img>` elements loading directly from XIVAPI's asset endpoint (`format=webp`)
- Cache keyed by item ID stores both English name and icon path
