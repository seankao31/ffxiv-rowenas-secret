# Batch Crafting Cost Scanner

**Linear:** ENG-69
**Status:** Design approved

## Purpose

Background batch process that computes the cheapest crafting cost for every recipe after each market scan cycle. Produces a thin `Map<itemId, CraftCostEntry>` cache that downstream consumers (ENG-70 rankings scorer) join with live market data to compute profitability.

## Design Decisions

- **Thin cache, not fat** — stores only craft cost, confidence, and recipe metadata. Sell price, velocity, competition, and profit are computed at query time by the rankings scorer. This avoids staleness between scan cycles and keeps scoring flexible.
- **Inline in scanner loop** — runs synchronously at the end of each scan cycle, after `setScanMeta()`. Simple and predictable; no event bus needed. A follow-up issue will refactor scanner orchestration to event-driven when there are more consumers.
- **Shared memo** — one `Map<number, CraftingNode>` across all recipe evaluations per batch run. FFXIV recipes form a DAG (no cycles), so shared sub-components collapse. Discarded after the batch completes; fresh memo each cycle.
- **No depth cap** — `maxDepth` removed from the batch path. The recipe graph is acyclic, so recursion terminates naturally. The depth guard and its memo-poisoning protection are unnecessary.
- **One entry per item** — if an item has multiple recipes, only the cheapest is stored. `companyCraft` recipes are skipped.

## Data Structure

```typescript
type CraftCostEntry = {
  itemId: number       // result item ID
  recipeId: number     // recipe that was cheapest
  job: number          // crafter job for that recipe
  level: number        // required job level
  craftCost: number    // per-unit cost via optimal craft tree
  confidence: number   // min confidence across all ingredients
}
```

## Integration

### Scanner (`scanner.ts`)

After `setScanMeta()` at the end of each scan cycle, call `runCraftCostBatch()` synchronously. This function:

1. Creates a shared `Map<number, CraftingNode>` memo
2. Iterates all unique recipe result item IDs (from `byResult` index in `recipes.ts`)
3. For each item, calls the solver with the shared memo, current `itemCache`, and `vendorPrices`
4. Collects `CraftCostEntry` results into a new `Map<number, CraftCostEntry>`
5. Atomically swaps the cache via `setCraftCosts()`

### Solver (`crafting.ts`)

New batch-oriented entry point:

```typescript
function solveCraftCostBatch(
  itemIds: number[],
  cache: Map<number, ItemData>,
  vendorPrices: Map<number, number>,
): Map<number, CraftCostEntry>
```

- Creates a shared `Map<number, CraftingNode>` memo internally
- Calls `solveNode()` for each item with no depth cap
- Returns only thin `CraftCostEntry` data (no full tree, no sell-side prices)

The existing `solveCraftingCost()` remains unchanged for the item detail page use case.

### Cache (`cache.ts`)

New module-level state:

```typescript
let craftCostCache: Map<number, CraftCostEntry> = new Map()

function setCraftCosts(costs: Map<number, CraftCostEntry>): void
function getCraftCosts(): Map<number, CraftCostEntry>
```

`setCraftCosts()` performs an atomic swap (replace the entire map reference). No partial updates.

### Fixture mode

`seedFixtureData()` should seed a `craftCostCache` snapshot so that `FIXTURE_DATA=true` mode includes craft cost data for development.

## Out of Scope

- Rankings scorer and API endpoint (ENG-70)
- Shared sell-side helper extraction (ENG-70)
- Job level filtering in batch mode (ENG-74)
- Event-driven scanner refactor (follow-up issue to file)

## Dependencies

- **ENG-64** (done) — recursive crafting cost engine
- **ENG-87** (done) — recipe data indexes

## Dependents

- **ENG-70** — profit ranking scorer (consumes `getCraftCosts()`)

## Testing Strategy

1. **Batch output** — given a set of recipes and market data, verify correct `CraftCostEntry` for each item (cost, confidence, recipe selection)
2. **Shared memo** — two recipes sharing an ingredient; verify the sub-component is solved once (inspect memo size or use a spy)
3. **Multi-recipe items** — item with two recipes, verify cheapest is chosen
4. **companyCraft filtering** — companyCraft-only items excluded from output
5. **Atomic swap** — `setCraftCosts()` replaces entire map; stale entries from removed recipes don't persist
6. **No depth cap** — deep DAG (3+ levels) resolves fully without truncation
7. **Integration** — scanner calls batch after scan cycle; craft cost cache populated with expected entries
