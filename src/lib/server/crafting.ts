import { getRecipesByResult, getAllRecipeResultIds } from '$lib/server/recipes'
import {
  MARKET_TAX,
  SOURCE_TIME_CONSTANT_H,
  MS_PER_HOUR,
  HOME_WORLD_ID,
  confidence,
} from '$lib/server/scoring'
import type { ItemData, CraftingNode, CraftingResult, CraftAction, CraftCostEntry } from '$lib/shared/types'

const DEFAULT_MAX_DEPTH = 10

export function solveCraftingCost(
  itemId: number,
  cache: Map<number, ItemData>,
  vendorPrices: Map<number, number>,
  options?: {
    jobLevels?: Record<number, number>
    maxDepth?: number
    nameMap?: Map<number, string>
  },
): CraftingResult | null {
  if (getRecipesByResult(itemId).every(r => r.companyCraft ?? false)) return null

  const now = Date.now()
  const memo = new Map<number, CraftingNode>()
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const jobLevels = options?.jobLevels
  const nameMap = options?.nameMap

  const root = solveNode(itemId, 1, cache, vendorPrices, jobLevels, memo, now, 0, maxDepth, nameMap)

  const itemDataForRoot = cache.get(itemId)
  let cheapestListing: CraftingResult['cheapestListing'] = null
  let realisticSellPrice: number | null = null

  if (itemDataForRoot && itemDataForRoot.listings.length > 0) {
    const cheapest = itemDataForRoot.listings.reduce((a, b) =>
      b.pricePerUnit < a.pricePerUnit ? b : a,
    )
    cheapestListing = {
      price: cheapest.pricePerUnit * (1 + MARKET_TAX),
      world: cheapest.worldName,
    }

    const homeListings = itemDataForRoot.listings.filter(l => l.worldID === HOME_WORLD_ID)
    if (homeListings.length > 0) {
      const cheapestHome = Math.min(...homeListings.map(l => l.pricePerUnit))
      realisticSellPrice = cheapestHome
      if (itemDataForRoot.recentHistory.length > 0) {
        const prices = itemDataForRoot.recentHistory.map(s => s.pricePerUnit).sort((a, b) => a - b)
        const medianPrice = prices[Math.floor(prices.length / 2)]!
        realisticSellPrice = Math.min(cheapestHome, medianPrice)
      }
    }
  }

  return {
    root,
    totalCost: root.totalCost,
    confidence: root.confidence,
    cheapestListing,
    realisticSellPrice,
    profitVsBuy: cheapestListing !== null ? cheapestListing.price - root.totalCost : null,
    profitVsSell: realisticSellPrice !== null
      ? realisticSellPrice * (1 - MARKET_TAX) - root.totalCost
      : null,
  }
}

export function solveCraftCostBatch(
  cache: Map<number, ItemData>,
  vendorPrices: Map<number, number>,
): Map<number, CraftCostEntry> {
  const now = Date.now()
  const memo = new Map<number, CraftingNode>()
  const results = new Map<number, CraftCostEntry>()

  for (const itemId of getAllRecipeResultIds()) {
    const recipes = getRecipesByResult(itemId)
    if (recipes.every(r => r.companyCraft ?? false)) continue

    const node = solveNode(itemId, 1, cache, vendorPrices, undefined, memo, now, 0, Infinity)

    // Only store items where crafting wins — buy-optimal items are irrelevant to
    // craft-for-profit rankings. The rankings scorer (ENG-70) computes profit at query time.
    if (node.action === 'craft' && node.recipe) {
      results.set(itemId, {
        itemId,
        recipeId: node.recipe.recipeId,
        job: node.recipe.job,
        level: node.recipe.level,
        craftCost: node.unitCost,
        confidence: node.confidence,
      })
    }
  }

  return results
}

function solveNode(
  itemId: number,
  amount: number,
  cache: Map<number, ItemData>,
  vendorPrices: Map<number, number>,
  jobLevels: Record<number, number> | undefined,
  memo: Map<number, CraftingNode>,
  now: number,
  depth: number,
  maxDepth: number,
  nameMap?: Map<number, string>,
): CraftingNode {
  // Memoization: return cached result adjusted for requested amount
  const cached = memo.get(itemId)
  if (cached) {
    return { ...cached, amount, totalCost: cached.unitCost * amount }
  }

  // Market buy option
  const itemEntry = cache.get(itemId)
  let marketPrice: number | null = null
  let marketWorld: string | null = null
  let marketConfidence = 0

  if (itemEntry && itemEntry.listings.length > 0) {
    const cheapest = itemEntry.listings.reduce((a, b) =>
      b.pricePerUnit < a.pricePerUnit ? b : a,
    )
    marketPrice = cheapest.pricePerUnit * (1 + MARKET_TAX)
    marketWorld = cheapest.worldName
    const uploadTime = itemEntry.worldUploadTimes[cheapest.worldID] ?? 0
    const ageHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
    marketConfidence = confidence(ageHours, SOURCE_TIME_CONSTANT_H)
  }

  // Vendor buy option (no tax on NPC purchases)
  const vendorPrice = vendorPrices.get(itemId) ?? null

  // Craft option — only evaluated if within depth cap
  let craftCost: number | null = null
  let craftConfidence = 1
  let bestRecipe: { id: number; job: number; lvl: number; yields: number } | null = null
  let bestIngredientNodes: CraftingNode[] = []

  if (depth < maxDepth) {
    const recipes = getRecipesByResult(itemId)
      .filter(r => !r.companyCraft)
      .filter(r => !jobLevels || (jobLevels[r.job] !== undefined && r.lvl <= jobLevels[r.job]!))

    for (const recipe of recipes) {
      let batchCost = 0
      const ingredientNodes: CraftingNode[] = []
      for (const ing of recipe.ingredients) {
        const child = solveNode(ing.id, ing.amount, cache, vendorPrices, jobLevels, memo, now, depth + 1, maxDepth, nameMap)
        batchCost += child.totalCost
        ingredientNodes.push(child)
      }
      const costPerUnit = batchCost / recipe.yields
      if (craftCost === null || costPerUnit < craftCost) {
        craftCost = costPerUnit
        bestRecipe = { id: recipe.id, job: recipe.job, lvl: recipe.lvl, yields: recipe.yields }
        bestIngredientNodes = ingredientNodes
        craftConfidence = ingredientNodes.length > 0
          ? Math.min(...ingredientNodes.map(n => n.confidence))
          : 1
      }
    }
  }

  // Pick cheapest option
  type Option = { action: CraftAction; unitCost: number; conf: number }
  const options: Option[] = []
  if (marketPrice !== null) options.push({ action: 'buy', unitCost: marketPrice, conf: marketConfidence })
  if (vendorPrice !== null) options.push({ action: 'vendor', unitCost: vendorPrice, conf: 1 })
  if (craftCost !== null) options.push({ action: 'craft', unitCost: craftCost, conf: craftConfidence })

  const best = options.length > 0
    ? options.reduce((a, b) => b.unitCost < a.unitCost ? b : a)
    : { action: 'buy' as CraftAction, unitCost: Infinity, conf: 0 }

  const itemName = nameMap?.get(itemId)

  const node: CraftingNode = {
    itemId,
    ...(itemName !== undefined && { itemName }),
    amount,
    action: best.action,
    unitCost: best.unitCost,
    totalCost: best.unitCost * amount,
    confidence: best.conf,
    marketPrice,
    vendorPrice,
    craftCost,
    marketWorld,
  }

  if (best.action === 'craft' && bestRecipe) {
    node.recipe = {
      recipeId: bestRecipe.id,
      job: bestRecipe.job,
      level: bestRecipe.lvl,
      yields: bestRecipe.yields,
      ingredients: bestIngredientNodes,
    }
  }

  // Only cache nodes where crafting was fully evaluated (not depth-limited).
  // A depth-capped node is forced to buy/vendor without considering crafting —
  // caching it would poison shallower occurrences of the same item that should
  // explore crafting. With default maxDepth=10 and FFXIV trees at 1-5 levels,
  // the depth cap rarely fires; this guard is a correctness safety net.
  if (depth < maxDepth) {
    memo.set(itemId, { ...node, amount: 1, totalCost: node.unitCost })
  }

  return node
}
