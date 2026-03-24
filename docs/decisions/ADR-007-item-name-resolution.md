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

## Consequences

- All item names are available **before the first scan starts** — no more incremental hydration.
- If GitHub is unreachable at startup, names fall back to `Item #${id}` (non-fatal).
- Names are in TC Chinese, matching the in-game locale for 陸行鳥 players.
