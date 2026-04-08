# ADR-011: Game Data Sourcing Strategy — XIVAPI v2 Incremental, Overhaul Later

**Status:** Accepted
**Date:** 2026-04-07

## Context

The app currently depends on external data for two things: market board data (Universalis) and item names (FFXIV_Market msgpack, per ADR-007). New features — starting with NPC vendor price arbitrage, followed by crafting recipes, retainer ventures, and more — require additional game data: vendor prices, recipe ingredients, gathering info, etc.

This data is static between game patches (every ~3-4 months) and is available from multiple sources that all derive from the same upstream (SaintCoinach reverse-engineered game sheets). See `docs/ffxiv-data-sources.md` for a full comparison of available sources.

## Decision

**Use XIVAPI v2's sheet API to fetch game data incrementally, on an as-needed basis.** Each new feature fetches only the specific sheets it needs at server startup. Accept that this approach will need a complete overhaul once the full scope of data requirements is clearer.

The first use case is NPC vendor prices: fetch the `GilShopItem` sheet at startup to build a `Set<number>` of vendor-sold item IDs, and read `Item.PriceMid` for the actual prices.

## Rationale

- **No new dependencies:** We already use XIVAPI v2 on the client for icons and English fallback names. Adding server-side sheet fetches uses the same API.
- **YAGNI:** We don't yet know the full scope of data needed across future pages. Building a comprehensive data pipeline now would be premature.
- **Acceptable startup cost:** Paginating a single sheet (~33 pages for GilShopItem) adds ~10 seconds to server startup, which is fine for a personal tool that restarts infrequently.
- **Isolated and replaceable:** Each feature's data fetching is self-contained, making it straightforward to swap out when the overhaul happens.

## Alternatives Considered

### Teamcraft `extracts.json` (27 MB, MIT licensed)

A single pre-built JSON file containing every item's acquisition methods: vendor prices, crafting recipes, gathering nodes, retainer ventures, and 20+ other source types. One download replaces all per-sheet XIVAPI queries.

**Rejected for now** because downloading and processing 27 MB of data for every feature is overkill when we only need one sheet today. However, this is the leading candidate for the eventual overhaul — it's comprehensive, well-typed, and MIT licensed.

### Garland Tools API

Per-item API with rich data (vendor prices, recipes, NPC locations). No bulk endpoint — one request per item.

**Rejected** because the lack of bulk fetching makes it impractical for building server-side lookup tables. Better suited for on-demand client-side enrichment.

### Static data files in the repo

Download game data once, process into our own format, commit to the repo. Update manually on game patches.

**Deferred.** This is likely the right long-term approach (possibly using Teamcraft extracts as the upstream source), but designing the schema and build pipeline is premature when we're still discovering what data we need.

## Consequences

- Each new game data need adds startup time (one sheet pagination per feature). This is manageable for 2-3 sheets but will degrade if we keep adding.
- Server startup depends on XIVAPI availability. If XIVAPI is down, new data (vendor prices, etc.) will be missing but the app degrades gracefully.
- All XIVAPI-based data fetching is explicitly temporary scaffolding. When the overhaul happens, it should be replaceable without affecting the rest of the app.
- TW Chinese item names remain sourced from FFXIV_Market's `tw-items.msgpack` (ADR-007). This is the one dependency that has no easy replacement — no other source has comparably complete TW translations.
