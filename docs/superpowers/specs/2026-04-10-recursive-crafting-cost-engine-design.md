# Recursive Crafting Cost Engine

**Linear:** ENG-64  
**Module:** `src/lib/server/crafting.ts`  
**Status:** Design approved

## Purpose

Server-side solver that determines the cheapest way to obtain a craftable item by recursively comparing crafting cost vs. market purchase vs. NPC vendor at each node in the recipe tree. Powers two consumer use cases:

1. **Item detail page** — "Should I craft this or just buy it?" (compares craft cost vs. cheapest cross-world listing)
2. **Craft-for-profit rankings** — "Is crafting this profitable?" (compares craft cost vs. realistic home-world sell price)

## Interface

```typescript
function solveCraftingCost(
  itemId: number,
  options?: {
    jobLevels?: Record<number, number>  // job ID -> player level
    maxDepth?: number                    // recursion cap, default 10
  }
): CraftingResult | null
```

Returns `null` if the item has no recipe. Synchronous — reads from in-memory scanner cache and recipe indexes.

### Dependencies

All via existing module-level singletons:

- `getRecipesByResult()` from `recipes.ts` — recipe lookup by result item
- `getAllItems()` from `cache.ts` — cross-world market listings
- `getVendorPrices()` from `cache.ts` — NPC prices
- `confidence()` from `scoring.ts` — exponential decay function (currently local to scoring.ts; extract and export as part of implementation)

## Output Types

```typescript
type CraftAction = 'craft' | 'buy' | 'vendor'

type CraftingNode = {
  itemId: number
  amount: number            // total quantity needed
  action: CraftAction       // cheapest option chosen
  unitCost: number          // cost per unit via chosen action
  totalCost: number         // unitCost * amount
  confidence: number        // data freshness (exponential decay, 0-1)

  // Present when action === 'craft'
  recipe?: {
    recipeId: number
    job: number
    level: number
    yields: number
    ingredients: CraftingNode[]
  }

  // Price context for all alternatives
  marketPrice: number | null    // cheapest cross-world listing (with 5% tax)
  vendorPrice: number | null    // NPC price, if available
  craftCost: number | null      // cost to craft, if recipe exists
  marketWorld: string | null    // world with cheapest listing
}

type CraftingResult = {
  root: CraftingNode
  totalCost: number            // rolled-up cost of entire tree
  confidence: number           // min confidence across all ingredients

  // Reference prices for the finished item
  cheapestListing: {
    price: number
    world: string
  } | null
  realisticSellPrice: number | null

  // Comparison
  profitVsBuy: number | null   // cheapestListing.price - totalCost
  profitVsSell: number | null  // realisticSellPrice - totalCost
}
```

## Algorithm

Recursive solver with memoization via `Map<number, CraftingNode>`.

### For each item:

1. **Check memo** — return cached result if already solved. Memo stores per-unit decisions (action, unitCost, confidence, recipe). Caller scales `amount` and `totalCost` to the requested quantity.
2. **Check depth** — if exceeds `maxDepth`, treat as buy-only
3. **Price the buy option:**
   - Find cheapest cross-world listing from scanner cache
   - Apply 5% buy tax to market price
   - Check vendor price (no tax)
   - Buy price = min(market, vendor)
4. **Price the craft option:**
   - Get all recipes via `getRecipesByResult(itemId)`
   - Filter out `companyCraft: true`
   - Filter by `jobLevels` if provided (exclude recipes where `recipe.lvl > jobLevels[recipe.job]`)
   - For each remaining recipe: recursively solve each ingredient, sum costs, divide by `recipe.yields`
   - Pick the cheapest recipe
5. **Pick cheapest action** — min of buy price and craft cost
6. **Compute confidence:**
   - Market buy: `confidence(listingAgeHours, SOURCE_TIME_CONSTANT_H)` where `listingAgeHours` is derived from the listing's `lastReviewTime` (reuse 12h constant from scoring.ts)
   - Vendor: `1.0` (always available, never stale)
   - Craft: min confidence across all ingredients in the chosen recipe
7. **Cache in memo and return**

### Multi-recipe handling

383 items in the dataset have multiple recipes (different crafter jobs or alternate routes). The solver evaluates all eligible variants and picks the cheapest. Memoization ensures each sub-component is only evaluated once regardless of how many branches reference it.

### Memoization key

Keyed by `itemId` alone. The optimal way to obtain an item doesn't change within a single solve call (same market state, same job levels).

### Realistic sell price

For `CraftingResult.realisticSellPrice`: `min(cheapest home-world listing, median of recent home-world sale history)`. Same logic as the arbitrage scorer — caps expected sell price at what the market actually bears.

### 5% buy tax

Applied to market purchases only. Vendor purchases and crafting have no buy tax in FFXIV.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No recipe exists | `solveCraftingCost()` returns `null` |
| No market data AND no vendor price for leaf | Node gets `confidence: 0`; cost = `Infinity` |
| All recipes filtered by job levels | Falls back to buy |
| Circular recipe reference | Depth cap forces buy at max depth |
| Scanner not ready | Caller's responsibility — API endpoint checks `isCacheReady()` before calling solver |

## Known Limitations (future work)

- **NPC quest locks** — some vendor items require quest completion; not modeled (ENG-68 sourcing complexity)
- **Teleport costs** — travel to NPC vendors has a gil cost; not included
- **Convenience factor** — buying everything on market board is more convenient than visiting NPCs; not modeled
- **Inventory awareness** — solver doesn't account for items the player already owns (ENG-93, low priority backlog)
- **HQ distinction** — solver treats NQ and HQ listings equivalently; no HQ-specific pricing

## Dependencies

- **ENG-87** (done) — recipe data indexes
- **ENG-56** (done) — vendor prices

## Dependents

- **ENG-65** — crafting cost API endpoint (wraps this solver)
- **ENG-66** — crafting breakdown section on item detail page
- **ENG-70** — profit ranking scorer (batch calls to this solver)
- **ENG-74** — crafter level filtering (provides `jobLevels` parameter)

## Testing Strategy

Pure function with injectable state via module-level caches. Test by populating cache before each test.

1. **Leaf items** — buy-only (market), buy-only (vendor), vendor preferred when cheaper
2. **Simple one-level craft** — 2 ingredients, verify cost = sum / yields, verify 5% tax on market only
3. **Recursive craft-vs-buy** — sub-ingredient cheaper to craft vs. cheaper to buy
4. **Multi-recipe selection** — 2 recipes, picks cheaper; with jobLevels filtering, picks remaining
5. **Yields** — recipe yields 3, verify per-unit = ingredients / 3
6. **Memoization (diamond dependency)** — ingredients A and B both need C; C solved once
7. **Depth cap** — deep chain falls back to buy at max depth
8. **Confidence** — fresh listing high, stale listing low, vendor 1.0, composite = min
9. **Reference prices** — cheapestListing, realisticSellPrice, profitVsBuy, profitVsSell
10. **Edge cases** — no data (confidence 0), companyCraft filtered, empty recipes after job filter
