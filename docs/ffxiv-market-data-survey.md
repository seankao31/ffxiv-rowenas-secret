# FFXIV_Market Data Survey

Survey of beherw/FFXIV_Market's pre-built msgpack data files, build pipeline,
and runtime consumption patterns. Written 2026-04-08.

## Overview

FFXIV_Market is a TW-focused market board dashboard (React + Vite SPA). It
pre-builds 21 msgpack files (~80 MB total) from Teamcraft's `extracts.json`
and a TW dataminer pipeline. Files are fetched lazily at runtime, decoded with
`@msgpack/msgpack`, and cached in memory. All data is static between game
patches.

- **Repo:** https://github.com/beherw/FFXIV_Market
- **License:** None (all rights reserved)
- **Framework:** React 18 + Vite + Tailwind
- **Data library:** `@msgpack/msgpack ^3.1.3`

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

Companion files loaded on-demand when rendering obtainable methods.
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

---

## 2. Build Pipeline

### Scripts

| Script | Input | Output |
|--------|-------|--------|
| `build-items-data.js` | Teamcraft item JSONs + tw-items.json | 8 `*-items.msgpack` + `equipment.msgpack` |
| `build-recipe-data.js` | tw-recipes.json + company-craft CSV | `recipes.msgpack` |
| `build-obtainable-methods-optimized.js` | Teamcraft `extracts.json` + instances/maps/places JSON | `obtainable-methods.msgpack` |
| `build-obtainable-domains.js` | Teamcraft NPC/shop/quest/instance/achievement/leve/place JSONs | 9 domain msgpack files |
| `build-ui-categories.js` | Teamcraft ui-categories.json + tw-item-ui-categories.json | `ui_categories.msgpack` |
| `build-fates-data.js` | Teamcraft fate JSONs + tw-fates.json | `fates.msgpack` |

### Data sources

All scripts read from two local sources:

1. **Teamcraft git submodule** (`teamcraft_git/libs/data/src/lib/json/`) —
   the MIT-licensed game data extraction. Contains `extracts.json` (27 MB,
   all item acquisition methods), plus individual JSONs for items, recipes,
   NPCs, shops, instances, quests, achievements, fates, places, equipment,
   and UI categories, in EN/JA/DE/FR/ZH/KO.

2. **TW dataminer pipeline** (`tw_dataminer/`) — SaintCoinach extraction from
   the TW game client. Produces TW Chinese JSONs for items, NPCs, recipes,
   fates, places, UI categories, etc. Resolved via `scripts/resolve-tw-json.js`
   and `scripts/tw-json-paths.js`.

### Build order

The `prebuild` npm script runs before `vite build`:

```
resolve-tw-json → build-recipe-data → build-items-data → build-fates-data
  → build-obtainable-methods-optimized → build-obtainable-domains
```

### Transformations

Common patterns across all build scripts:
- Strip null/undefined/empty string values to reduce size
- Encode with `@msgpack/msgpack` (50-67% smaller than JSON, 5x faster parse)
- `build-obtainable-methods-optimized.js` is the most complex: it reads
  Teamcraft's `extracts.json`, resolves instance/quest/fate names, composes
  zone display names, and extracts only the fields used in the UI per source
  type

### Utility scripts (not part of build)

| Script | Purpose |
|--------|---------|
| `check-recipe-floats.mjs` | Validation: checks for floating-point recipe amounts |
| `test-item-set.mjs` | Validation: tests equipment set detection |
| `company-craft-from-csv.js` | Imported by `build-recipe-data.js` to append Company Craft recipes |
| `download_tesseract_files.js` | Downloads Tesseract OCR data (for screenshot price reading) |
| `download_model.js` | Downloads ML model (for OCR) |
| `extract-optimized-extracts.js` | Older extract script (superseded by `build-obtainable-methods-optimized.js`) |
| `build-obtainable-methods-data.js` | Older build script (superseded) |
| `build-obtainable-methods-v2.js` | Older build script (superseded) |

---

## 3. Runtime Architecture

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

### Design decisions

1. **Split by domain, not by item** — rather than one giant file, the data is
   split into topical files (items, recipes, NPCs, shops, etc.) so only needed
   data is loaded.

2. **Msgpack over JSON** — 50-67% size reduction, 5x faster parsing. The
   `@msgpack/msgpack` library handles encode/decode.

3. **No server required** — all data is static and served from `/public/data/`.
   The app is a pure SPA that could be hosted on any CDN.

4. **Teamcraft as upstream** — all game data originates from Teamcraft's
   extracts, with TW Chinese names from a separate dataminer pipeline.

5. **On-demand domain loading** — `obtainableDataService.js` inspects what
   source types an item has and only fetches the domain files required (e.g.,
   skip `shops.msgpack` if the item has no vendor sources).

### DataType enum

Source types in `obtainable-methods.msgpack` use string keys that map to
Teamcraft's numeric DataType enum. Centralized in `src/constants/dataTypes.js`:

| ID | String key | TW name |
|----|-----------|---------|
| 1 | `craft` | 製作 |
| 2 | `specialshop` | 兌換 |
| 3 | `vendor` | NPC商店 |
| 4 | `reduction` | 分解獲得 |
| 5 | `desynth` | 精製獲得 |
| 6 | `instance` | 副本 |
| 7 | `gathering` | 採集獲得 |
| 8 | `gardening` | 園藝獲得 |
| 9 | `voyage` | 遠航探索 |
| 10 | `drop` | 怪物掉落 |
| 11 | `alarm` | 時間限定 |
| 12 | `masterbook` | 秘籍習得 |
| 13 | `treasure` | 寶箱/容器 |
| 14 | `fate` | 危命任務 |
| 15 | `venture` | 雇員探險 |
| 18 | `quest` | 任務獎勵 |
| 19 | `achievement` | 成就獎勵 |
| 21 | `mogstation` | 商城購買 |
