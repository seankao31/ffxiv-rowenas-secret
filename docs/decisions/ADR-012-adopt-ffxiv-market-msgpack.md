# ADR-012: Adopt FFXIV_Market Msgpack Files as Primary Game Data Source

**Status:** Accepted (supersedes ADR-011)
**Date:** 2026-04-08

## Context

ADR-011 chose incremental XIVAPI v2 fetching as a temporary measure, deferring
a proper data pipeline until we understood our full data requirements. After
surveying FFXIV_Market's pre-built msgpack files (see
`docs/data-sources/ffxiv-market-data-survey.md`), we now have that understanding.

FFXIV_Market pre-builds 21 msgpack files (~80 MB total) covering item names
(7 languages), recipes, equipment, obtainable methods, NPCs, shops, quests,
instances, fates, achievements, and more. The upstream source is Teamcraft's
`extracts.json` (MIT licensed), enriched with TW Chinese names from a separate
dataminer pipeline. The schemas closely match what we would build ourselves.

### Current state

| Data need | Current source |
|-----------|---------------|
| TW item names | FFXIV_Market `tw-items.msgpack` via GitHub raw URL |
| English item names | XIVAPI v2 `Item.Name` (client-side, per-item) |
| Item icons | XIVAPI v2 `Item.Icon` (client-side, per-item) |
| NPC vendor items + prices | XIVAPI v2 `GilShopItem` + `Item.PriceMid` (server startup) |
| Market board data | Universalis API |

### Roadmap data needs

| Project | Data needs |
|---------|-----------|
| Crafting Optimizer | Recipes with ingredients, crafting tree construction |
| Craft-for-Profit Rankings | Recipes + market prices for cost calculation |
| Item Detail | Obtainable methods, multi-language names |
| Retainer Venture Optimizer | Retainer venture task definitions + loot tables |

## Decision

**Adopt FFXIV_Market's pre-built msgpack files as the primary source of game
data.** Retain XIVAPI v2 only for item icons and vendor price verification.

### What to adopt and when

**Immediate (next feature work):**

| File | Replaces | Why |
|------|----------|-----|
| `tw-items.msgpack` | GitHub raw fetch in `universalis.ts` | Already using it — switch to local copy |
| `recipes.msgpack` | Nothing (not yet built) | Crafting Optimizer and Craft-for-Profit both need this |

**When building the relevant feature:**

| File | When | Why |
|------|------|-----|
| `obtainable-methods.msgpack` | Item Detail | "How to get this item" |
| `equipment.msgpack` | Item Detail / advanced search | Equipment level and job filtering |
| `ui_categories.msgpack` | Item search/browse | Category-based browsing |

**Defer (only useful alongside obtainable methods rendering):**

Domain lookup files (`npcs.msgpack`, `shops.msgpack`, `quests.msgpack`,
`instances.msgpack`, `achievements.msgpack`, `leves.msgpack`, `places.msgpack`,
`voyages.msgpack`, `loot-sources.msgpack`, `fates.msgpack`) and non-TW/EN
language files.

### What XIVAPI v2 still provides

- **Item icons** (`Item.Icon`) — FFXIV_Market doesn't include icon data.
  XIVAPI's asset endpoint serves them as webp on demand.
- **English fallback names** (`Item.Name`) — XIVAPI queries live game data,
  so it covers items added in patches before FFXIV_Market updates. Using
  `en-items.msgpack` instead would defeat the purpose of the fallback, since
  both files would be stale at the same time.
- **Vendor price verification** (`GilShopItem` + `Item.PriceMid`) — our
  arbitrage page needs vendor prices, which are in the items' `PriceMid`
  field. FFXIV_Market's `obtainable-methods.msgpack` also has vendor prices
  (in the `vendor` source type), but our current vendors.ts with its
  false-positive blocklist is battle-tested. Keep it until we have reason to
  change.

### Integration method

**Build-time download script** that fetches needed msgpack files from
FFXIV_Market's GitHub repository. The script runs as part of the build/deploy
pipeline and fails the build if any download fails — no silent degradation.
Downloaded files are stored locally and read by the server at startup.

If we later need to customize schemas (e.g., pruning obtainable-methods to
only the types we render), we can fork individual build scripts at that point.

### Loading architecture

Unlike FFXIV_Market (a pure SPA that loads everything client-side), we run
SvelteKit with SSR. Our approach:

- **Server-side** (preferred): Decode msgpack in `+page.server.ts` loaders or
  at server startup. Keep data in Node.js memory. Clients never download
  multi-MB data files.
- **Client-side** (for interactive drill-down): Follow FFXIV_Market's lazy
  fetch + decode + cache pattern where server-side loading would be wasteful
  (e.g., crafting tree expansion triggered by user interaction).

## Rationale

- **No pipeline to build.** FFXIV_Market already solved this — 6 build scripts
  produce all the data we need. Replicating that work buys us nothing.
- **Schemas match our needs.** The recipe format (id, result, job, level,
  yields, ingredients) is exactly what the Crafting Optimizer needs. The
  obtainable methods format covers every acquisition type for Item Detail.
- **TW Chinese is included.** This is the only source with complete TW
  translations, and it's already in the files.
- **Eliminates startup API dependency.** Server startup currently depends on
  XIVAPI being available for vendor prices. With local msgpack files, the only
  external runtime dependency is Universalis (for market data, which is
  inherently real-time).
- **Size is manageable.** The two immediate files total ~5.7 MB. Even the
  full set (~80 MB) fits comfortably in Node.js memory.

## Alternatives Considered

### Continue with XIVAPI v2 incremental (ADR-011 status quo)

Each new feature adds another sheet pagination at startup. This was always
intended as temporary scaffolding. With 4+ features on the roadmap that all
need broad game data, the incremental approach no longer scales — it's time
for the overhaul ADR-011 predicted.

### Build our own pipeline from Teamcraft extracts (future plan)

Write our own build scripts that read Teamcraft's MIT-licensed JSON data
(items, recipes, extracts, etc.) and produce msgpack files in our own format.
For TW Chinese, use Teamcraft's `tw/` locale files directly instead of
FFXIV_Market's `tw_dataminer/` output. Full control, no license concerns.

This is the right long-term approach but premature today — FFXIV_Market's
schemas already fit our needs and we'd be duplicating effort for no
functional benefit. Planned as a future task.

### Git submodule

Pin `beherw/FFXIV_Market` as a submodule. Versioned and reproducible, but
adds submodule management complexity to CI, Docker, and developer workflow
for files we only need at build time.

## Consequences

- **New dependency:** We depend on FFXIV_Market's repo structure and msgpack
  schemas. If they make breaking changes, we need to update. Build fails
  loudly if files are unavailable.
- **License:** FFXIV_Market's README states "本專案僅供教育用途" (this
  project is for educational purposes only). This is a common fair-use
  declaration in Taiwan for non-commercial projects. Our use is defensible:
  this is a personal learning project, not commercial, and all underlying
  game data derives from Square Enix sheets that the community freely
  extracts and shares. That said, using their pre-built files at scale or
  commercially would not be defensible. We plan to build our own pipeline
  from Teamcraft's MIT-licensed data (see alternative above) to eliminate
  this dependency entirely.
- **Data freshness:** Msgpack files are rebuilt when FFXIV_Market updates
  their Teamcraft submodule (typically after game patches). We get the latest
  files on each build.
- **ADR-011 is superseded:** XIVAPI v2 is no longer the default for new game
  data needs. It remains in use only for icons, English fallback names, and
  vendor price verification.
