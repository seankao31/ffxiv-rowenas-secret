# FFXIV_Market Data Survey

ENG-81 — Survey of beherw/FFXIV_Market's pre-built msgpack data files, build
pipeline, and runtime consumption patterns. Written 2026-04-08.

## Executive Summary

FFXIV_Market pre-builds 21 msgpack files (~80 MB total) from Teamcraft's
`extracts.json` and a TW dataminer pipeline. The data covers item names
(7 languages), recipes, equipment, obtainable methods, NPCs, shops, instances,
quests, fates, achievements, leves, loot sources, voyages, places, and UI
categories. Files are fetched lazily at runtime, decoded with `@msgpack/msgpack`,
and cached in memory.

We currently consume exactly **one** of these files: `tw-items.msgpack` (fetched
from GitHub raw at server startup for TW Chinese item names). Everything else
comes from ad-hoc XIVAPI v2 calls.

---

## 1. Data File Inventory

### Item names (per-language)

| File | Size | Schema | Source JSON |
|------|------|--------|-------------|
| `tw-items.msgpack` | 1.3 MB | `Record<itemID, { tw: string }>` | `tw_dataminer/` → `tw-items.json` |
| `zh-items.msgpack` | 1.4 MB | `Record<itemID, { zh: string }>` | `teamcraft:zh/zh-items.json` |
| `en-items.msgpack` | 1.6 MB | `Record<itemID, { en: string }>` | `teamcraft:items.json` (en field) |
| `ja-items.msgpack` | 2.3 MB | `Record<itemID, { ja: string }>` | `teamcraft:items.json` (ja field) |
| `ko-items.msgpack` | 1.8 MB | `Record<itemID, { ko: string }>` | `teamcraft:ko/ko-items.json` |
| `de-items.msgpack` | 1.8 MB | `Record<itemID, { de: string }>` | `teamcraft:items.json` (de field) |
| `fr-items.msgpack` | 1.9 MB | `Record<itemID, { fr: string }>` | `teamcraft:items.json` (fr field) |

All item name files share the same shape: a flat object keyed by numeric item ID
(as string), with a single language field. The build script (`build-items-data.js`)
reads Teamcraft JSON, strips null/empty values, and encodes to msgpack.

### Equipment

| File | Size | Schema |
|------|------|--------|
| `equipment.msgpack` | 2.5 MB | `Record<itemID, { level, jobs: string[], equipSlotCategory, ... }>` |

Source: `teamcraft:equipment.json`. Equipment entries contain equip level,
job abbreviation arrays (e.g. `["PLD","WAR"]`), and slot category. Used for
equipment set detection and advanced search filtering.

### Recipes

| File | Size | Schema |
|------|------|--------|
| `recipes.msgpack` | 4.4 MB | `Array<{ id, result, job, lvl, yields, ingredients: [{id, amount}], companyCraft? }>` |

Source: `tw-recipes.json` + Company Craft CSV append. Build script
(`build-recipe-data.js`) strips nulls and encodes. At runtime, the service
builds three indexes: by-result, by-ingredient, and a company-craft item set.
Supports crafting tree construction, ingredient lookup, and recipe filtering.

### Obtainable methods

| File | Size | Schema |
|------|------|--------|
| `obtainable-methods.msgpack` | 20.4 MB | `Record<itemID, Array<ObtainSource>>` |

The largest file. Source: Teamcraft `extracts.json` (~27 MB), processed by
`build-obtainable-methods-optimized.js`. Each source has a `type` string
(matching Teamcraft's DataType enum: `vendor`, `craft`, `gathering`,
`instance`, `quest`, `fate`, `venture`, `achievement`, etc.) and
type-specific data fields.

This is the "how do I get this item?" database. Each item maps to an array
of sources, each tagged with:
- `type` / `typeName` — acquisition method
- Type-specific fields (e.g., `npcId`, `price` for vendors; `instanceIds`
  for duties; `questId` for quest rewards)

### Domain lookup files

These are companion files loaded on-demand when rendering obtainable methods.
The `obtainableDataService.js` loads only the domains needed for the current
item's sources.

| File | Size | Schema | Purpose |
|------|------|--------|---------|
| `npcs.msgpack` | 18.8 MB | `{ twNpcs, npcs, npcsDatabasePages }` | NPC names (tw/en) + DB page metadata |
| `shops.msgpack` | 7.7 MB | `{ twShops, shops, shopsByNpc }` | Shop names + NPC-to-shop mapping |
| `quests.msgpack` | 7.3 MB | `{ twQuests, quests, zhQuests, questsDatabasePages }` | Quest names (tw/en/zh) + issuer NPC |
| `instances.msgpack` | 1.2 MB | `{ twInstances, instances, zhInstances }` | Duty/instance names (tw/en/zh) |
| `achievements.msgpack` | 1.0 MB | `{ twAchievements, twAchievementDescriptions, achievements }` | Achievement names + descriptions |
| `leves.msgpack` | 3.9 MB | `{ levesDatabasePages }` | Levequest data |
| `places.msgpack` | 0.6 MB | `{ twPlaces, places }` | Zone/area names (tw/en) |
| `fates.msgpack` | 0.3 MB | `{ fatesById, fateSourcesByItemId }` | FATE names/data + item→fate reverse index |
| `loot-sources.msgpack` | 0.04 MB | `{ lootSourcesByItemId }` | Item→loot source reverse index |
| `voyages.msgpack` | 0.006 MB | `{ twSubmarineVoyages, twAirshipVoyages }` | Submarine/airship voyage names |
| `ui_categories.msgpack` | 0.5 MB | `{ itemIdToCategory, itemIdsByCategory, twItemUICategories }` | Item UI category mapping |

### Build script summary

| Script | Input | Output |
|--------|-------|--------|
| `build-items-data.js` | Teamcraft item JSONs + tw-items.json | 8 `*-items.msgpack` + `equipment.msgpack` |
| `build-recipe-data.js` | tw-recipes.json + company-craft CSV | `recipes.msgpack` |
| `build-obtainable-methods-optimized.js` | Teamcraft `extracts.json` + instances/maps/places JSON | `obtainable-methods.msgpack` |
| `build-obtainable-domains.js` | Teamcraft NPC/shop/quest/instance/achievement/leve/place JSONs | 9 domain msgpack files |
| `build-ui-categories.js` | Teamcraft ui-categories.json + tw-item-ui-categories.json | `ui_categories.msgpack` |
| `build-fates-data.js` | Teamcraft fate JSONs + tw-fates.json | `fates.msgpack` |

All scripts read from a local Teamcraft git submodule (`teamcraft_git/`) and
TW-specific JSONs produced by `tw_dataminer/`. The `prebuild` npm script runs
them all before `vite build`.

---

## 2. Runtime Architecture

FFXIV_Market is a **React + Vite SPA** (no SSR). All data loading happens
client-side.

### Loading pattern

```
fetch('/data/{file}.msgpack')
  → arrayBuffer()
  → decode(new Uint8Array(buf))
  → cache in module-level variable
  → return cached on subsequent calls
```

Every service follows the same pattern:
1. **Lazy load** — file is fetched only when first needed
2. **Singleton promise** — concurrent callers share the same in-flight fetch
3. **Module-level cache** — once loaded, stays in memory for the session
4. **No expiry** — data is static (rebuilt at deploy time)

### Service layer

```
gameData.js          ← facade: item names, ilvl, rarity, equipment, UI categories
  ├── itemsDatabaseMsgpack.js   ← per-language item name files + equipment
  ├── uiCategoriesDataService.js ← ui_categories.msgpack
  └── Teamcraft JSON imports     ← ilvl, rarity, patch, market-items (bundled by Vite)

recipeDatabase.js    ← recipes.msgpack + in-memory indexes + crafting tree builder
obtainableMethodsMsgpack.js ← obtainable-methods.msgpack (main obtain lookup)
obtainableDataService.js    ← domain msgpacks (npcs, shops, quests, etc.)
fatesData.js         ← fates.msgpack
```

### Key design decisions

1. **Split by domain, not by item** — rather than one giant file, the data is
   split into topical files (items, recipes, NPCs, shops, etc.) so only needed
   data is loaded.

2. **Msgpack over JSON** — 50-67% size reduction, 5x faster parsing. The
   `@msgpack/msgpack` library handles encode/decode.

3. **No server required** — all data is static and served from `/public/data/`.
   The app is a pure SPA that could be hosted on any CDN.

4. **Teamcraft as upstream** — all game data originates from Teamcraft's
   extracts, with TW Chinese names from a separate dataminer pipeline.

---

## 3. Our Current Data Usage

### What we consume today

| Data need | Current source | Where |
|-----------|---------------|-------|
| TW item names | FFXIV_Market `tw-items.msgpack` via GitHub raw | `universalis.ts:fetchItemNames()` |
| English item names | XIVAPI v2 `Item.Name` | `xivapi.ts:fetchItemMetadata()` |
| Item icons | XIVAPI v2 `Item.Icon` | `xivapi.ts:fetchItemMetadata()` |
| NPC vendor item list | XIVAPI v2 `GilShopItem` sheet | `vendors.ts:fetchVendorItemIds()` |
| NPC vendor prices | XIVAPI v2 `Item.PriceMid` | `vendors.ts` |
| Market board data | Universalis API | `universalis.ts` |
| Marketable item IDs | Universalis `/marketable` | `universalis.ts:fetchMarketableItems()` |

### What our roadmap needs (from Linear projects)

| Project | Data needs |
|---------|-----------|
| **Crafting Optimizer** | Recipes with ingredients, crafting tree construction |
| **Craft-for-Profit Rankings** | Recipes + market prices for cost calculation |
| **Item Detail** | Obtainable methods (how to acquire any item), multi-language names |
| **Retainer Venture Optimizer** | Retainer venture task definitions + loot tables |

---

## 4. Recommendations

### Adopt these files now (high value, low risk)

| File | Why | Replaces |
|------|-----|----------|
| `tw-items.msgpack` | Already using it — but fetch from local copy instead of GitHub raw | Remote fetch in `universalis.ts` |
| `recipes.msgpack` | Crafting Optimizer and Craft-for-Profit both need recipe data. FFXIV_Market's schema matches what we'd build ourselves. | Not yet built; would replace XIVAPI Recipe sheet calls |
| `en-items.msgpack` | English fallback names without XIVAPI round-trips | XIVAPI `Item.Name` calls in `xivapi.ts` |

### Adopt when building the relevant feature

| File | When | Why |
|------|------|-----|
| `obtainable-methods.msgpack` | Item Detail page | "How to get this item" requires exactly this dataset |
| `equipment.msgpack` | Item Detail / advanced search | Equipment level and job filtering |
| `ui_categories.msgpack` | Item search/browse | Category-based browsing |

### Do NOT adopt (not needed for our use cases)

| File | Why skip |
|------|----------|
| `npcs.msgpack` (18.8 MB) | Only needed if rendering NPC names/locations in obtainable methods UI. Defer until Item Detail. |
| `shops.msgpack` (7.7 MB) | Same — vendor shop display. Defer until Item Detail. |
| `quests.msgpack`, `instances.msgpack`, `achievements.msgpack`, `leves.msgpack`, `places.msgpack`, `voyages.msgpack`, `loot-sources.msgpack`, `fates.msgpack` | Domain lookup files for obtainable methods rendering. Only useful alongside `obtainable-methods.msgpack`. |
| `zh-items.msgpack`, `ja-items.msgpack`, `ko-items.msgpack`, `de-items.msgpack`, `fr-items.msgpack` | We target TW Chinese + English fallback only. No need for other languages. |

### Integration approach

**Option A: Git submodule (recommended)**
Add `beherw/FFXIV_Market` as a git submodule. Copy needed msgpack files into
our static assets at build time. Pros: versioned, reproducible, no runtime
fetch to GitHub. Cons: submodule management overhead.

**Option B: Build our own pipeline**
Fork the build scripts, point them at our own Teamcraft submodule, generate
msgpack files ourselves. Pros: full control, can customize schemas. Cons:
duplicates significant work; FFXIV_Market's schemas are already well-suited.

**Option C: Fetch at deploy time**
CI/CD step downloads the latest msgpack files from FFXIV_Market's GitHub
releases or raw URLs. Pros: simple. Cons: fragile dependency on external repo
availability.

**Recommendation:** Start with Option A for files we adopt now (tw-items,
recipes, en-items). This is the simplest path that gives us versioned,
reproducible data without building our own pipeline. If we later need to
customize schemas (e.g., pruning obtainable-methods to only the types we
render), we can fork individual build scripts at that point.

### Architecture considerations

Our app is **SvelteKit with SSR**, not a pure SPA like FFXIV_Market. This
affects where we load data:

- **Server-side loading** (preferred for SEO + initial render): decode msgpack
  in `+page.server.ts` loaders, pass to components as props. Node.js has
  plenty of memory for the larger files.
- **Client-side loading** (for interactive features): follow FFXIV_Market's
  pattern of lazy fetch + decode + cache. Good for on-demand data like
  crafting trees.
- **Hybrid**: server-side for initial page data, client-side for drill-down.
  This is our natural SvelteKit pattern.

For the recipe database specifically, loading server-side and pre-building
indexes during startup would avoid the client downloading 4.4 MB of recipe
data. The crafting tree construction could happen server-side as an API
endpoint or in a `+page.server.ts` loader.

---

## 5. Differences from Our Current Data Source Doc

This survey supersedes the "FFXIV_Market (beherw)" section in
`docs/ffxiv-data-sources.md`, which listed only `tw-items.msgpack`. The full
inventory above should be used as the canonical reference.

The "Strategic Notes" in that doc recommended "XIVAPI v2 for new data needs
on an as-needed basis." This survey supports revising that: **FFXIV_Market's
pre-built files are a better fit for recipes, obtainable methods, and item
names, while XIVAPI remains appropriate for icons and vendor price
verification (GilShopItem).**
