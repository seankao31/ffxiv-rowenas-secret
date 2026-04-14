import { test, expect, describe, vi, beforeAll, afterAll } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { encode } from '@msgpack/msgpack'
import { initRecipes } from '$lib/server/recipes'
import type { Recipe } from '$lib/server/recipes'
import type { ItemData, Listing } from '$lib/shared/types'

const WORLD_A = 4033  // 巴哈姆特
const HOME = 4030     // 利維坦
const NOW = Date.now()
const FRESH = NOW - 30 * 60_000  // 30 min ago
const STALE_20H = NOW - 20 * 3_600_000  // 20 hours ago

const TEST_RECIPES: Recipe[] = [
  // Item 100: job 8 lvl 50, yields 1. Ingredients: item 10 x3, item 11 x2
  { id: 1, result: 100, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 10, amount: 3 }, { id: 11, amount: 2 }] },
  // Item 100: alternate recipe, job 9 lvl 55. Ingredients: item 12 x5
  { id: 2, result: 100, job: 9, lvl: 55, yields: 1,
    ingredients: [{ id: 12, amount: 5 }] },
  // Item 200: yields 3. Ingredients: item 13 x6
  { id: 3, result: 200, job: 8, lvl: 60, yields: 3,
    ingredients: [{ id: 13, amount: 6 }] },
  // Item 300: recursive. Ingredients: item 200 x2, item 14 x1
  { id: 4, result: 300, job: 8, lvl: 70, yields: 1,
    ingredients: [{ id: 200, amount: 2 }, { id: 14, amount: 1 }] },
  // Diamond: 400 → [401, 402] → both need 500
  { id: 5, result: 400, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 401, amount: 1 }, { id: 402, amount: 1 }] },
  { id: 6, result: 401, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 500, amount: 2 }] },
  { id: 7, result: 402, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 500, amount: 3 }] },
  // companyCraft — should be filtered out
  { id: 8, result: 600, job: 8, lvl: 1, yields: 1,
    ingredients: [{ id: 10, amount: 1 }], companyCraft: true },
  // Deep chain for depth cap: 700 → 701 → 702 → (item 10, buy-only)
  { id: 9, result: 700, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 701, amount: 1 }] },
  { id: 10, result: 701, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 702, amount: 1 }] },
  { id: 11, result: 702, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 10, amount: 1 }] },
  // Depth-cap memo regression: 800 → [801, 802]
  // 801 → 802 → 10 (deep path: 802 at depth 2, capped)
  // 802 → 10 (shallow path: 802 at depth 1, should still evaluate crafting)
  { id: 12, result: 800, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 801, amount: 1 }, { id: 802, amount: 1 }] },
  { id: 13, result: 801, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 802, amount: 1 }] },
  { id: 14, result: 802, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 10, amount: 1 }] },
]

function listing(price: number, worldId = WORLD_A, worldName = 'TestWorld'): Listing {
  return { pricePerUnit: price, quantity: 10, worldID: worldId, worldName, lastReviewTime: FRESH, hq: false }
}

function itemData(itemId: number, listings: Listing[], overrides?: Partial<ItemData>): ItemData {
  const worldUploadTimes: Record<number, number> = {}
  for (const l of listings) worldUploadTimes[l.worldID] = l.lastReviewTime
  return {
    itemID: itemId,
    worldUploadTimes,
    homeLastUploadTime: FRESH,
    listings,
    regularSaleVelocity: 5,
    hqSaleVelocity: 2,
    recentHistory: [],
    ...overrides,
  }
}

const fixtureDir = join(tmpdir(), `rowenas-crafting-test-${process.pid}`)
const originalLog = console.log

let solveCraftingCost: typeof import('$lib/server/crafting').solveCraftingCost
let solveCraftCostBatch: typeof import('$lib/server/crafting').solveCraftCostBatch

beforeAll(async () => {
  console.log = vi.fn(() => {}) as typeof console.log
  await mkdir(fixtureDir, { recursive: true })
  await writeFile(join(fixtureDir, 'recipes.msgpack'), encode(TEST_RECIPES))
  await initRecipes(join(fixtureDir, 'recipes.msgpack'))
  const mod = await import('$lib/server/crafting')
  solveCraftingCost = mod.solveCraftingCost
  solveCraftCostBatch = mod.solveCraftCostBatch
})

afterAll(async () => {
  console.log = originalLog
  await rm(fixtureDir, { recursive: true })
})

describe('solveCraftingCost', () => {
  test('returns null for item with no recipe', () => {
    const cache = new Map([[10, itemData(10, [listing(100)])]])
    expect(solveCraftingCost(10, cache, new Map())).toBeNull()
  })

  test('crafts item when cheaper than buying', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    expect(result).not.toBeNull()
    expect(result.root.action).toBe('craft')
    // Recipe 1: 3×100×1.05 + 2×100×1.05 = 315 + 210 = 525
    // Recipe 2: 5×200×1.05 = 1050
    // Market: 600×1.05 = 630
    // Craft via recipe 1 wins at 525
    expect(result.root.unitCost).toBe(525)
    expect(result.totalCost).toBe(525)
    expect(result.root.recipe!.recipeId).toBe(1)
    expect(result.root.recipe!.ingredients).toHaveLength(2)
    expect(result.root.recipe!.ingredients[0]!.action).toBe('buy')
    expect(result.root.recipe!.ingredients[0]!.itemId).toBe(10)
    expect(result.root.recipe!.ingredients[0]!.totalCost).toBeCloseTo(315)
  })

  test('buys item when cheaper than crafting', () => {
    // Make ingredients expensive so buying is cheaper
    const cache = new Map([
      [100, itemData(100, [listing(400)])],
      [10, itemData(10, [listing(500)])],
      [11, itemData(11, [listing(500)])],
      [12, itemData(12, [listing(500)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // Recipe 1: 3×500×1.05 + 2×500×1.05 = 1575 + 1050 = 2625
    // Market: 400×1.05 = 420
    // Buy wins at 420
    expect(result.root.action).toBe('buy')
    expect(result.root.unitCost).toBeCloseTo(420)
  })

  test('prefers vendor when cheaper than market', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const vendors = new Map([[11, 80]])  // vendor price 80, cheaper than market 100×1.05=105
    const result = solveCraftingCost(100, cache, vendors)!
    // Recipe 1 with vendor for item 11: 3×100×1.05 + 2×80 = 315 + 160 = 475
    expect(result.root.action).toBe('craft')
    expect(result.root.unitCost).toBe(475)
    const ing11 = result.root.recipe!.ingredients.find(n => n.itemId === 11)!
    expect(ing11.action).toBe('vendor')
    expect(ing11.unitCost).toBe(80)
    expect(ing11.vendorPrice).toBe(80)
  })

  test('prefers market when cheaper than vendor', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(50)])],    // market 50, cheaper than vendor 80
      [12, itemData(12, [listing(200)])],
    ])
    const vendors = new Map([[11, 80]])
    const result = solveCraftingCost(100, cache, vendors)!
    const ing11 = result.root.recipe!.ingredients.find(n => n.itemId === 11)!
    expect(ing11.action).toBe('buy')
    expect(ing11.unitCost).toBeCloseTo(52.5)  // 50×1.05
  })

  test('divides ingredient cost by yields', () => {
    const cache = new Map([
      [200, itemData(200, [listing(250)])],
      [13, itemData(13, [listing(100)])],
    ])
    const result = solveCraftingCost(200, cache, new Map())!
    // Ingredients: 6×100×1.05 = 630. Yields 3 → unitCost = 210
    // Market: 250×1.05 = 262.5
    // Craft wins at 210
    expect(result.root.action).toBe('craft')
    expect(result.root.unitCost).toBe(210)
    expect(result.root.recipe!.yields).toBe(3)
  })

  test('recursively crafts sub-ingredient when cheaper', () => {
    const cache = new Map([
      [300, itemData(300, [listing(600)])],
      [200, itemData(200, [listing(250)])],  // buy=262.5, craft=210 → craft
      [13, itemData(13, [listing(100)])],
      [14, itemData(14, [listing(100)])],
    ])
    const result = solveCraftingCost(300, cache, new Map())!
    // Item 200: craft at 210/unit, need 2 → 420
    // Item 14: buy at 105
    // Total: 525
    expect(result.root.action).toBe('craft')
    expect(result.root.unitCost).toBe(525)
    const ing200 = result.root.recipe!.ingredients.find(n => n.itemId === 200)!
    expect(ing200.action).toBe('craft')
    expect(ing200.unitCost).toBe(210)
    expect(ing200.totalCost).toBe(420)
    expect(ing200.recipe!.yields).toBe(3)
  })

  test('buys sub-ingredient when cheaper than crafting', () => {
    const cache = new Map([
      [300, itemData(300, [listing(600)])],
      [200, itemData(200, [listing(100)])],  // buy=105, craft=210 → buy
      [13, itemData(13, [listing(100)])],
      [14, itemData(14, [listing(100)])],
    ])
    const result = solveCraftingCost(300, cache, new Map())!
    // Item 200: buy at 105/unit, need 2 → 210
    // Item 14: buy at 105
    // Total: 315
    expect(result.root.unitCost).toBe(315)
    const ing200 = result.root.recipe!.ingredients.find(n => n.itemId === 200)!
    expect(ing200.action).toBe('buy')
    expect(ing200.unitCost).toBeCloseTo(105)
    expect(ing200.recipe).toBeUndefined()
  })

  test('picks cheapest recipe when multiple exist', () => {
    const cache = new Map([
      [100, itemData(100, [listing(2000)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // Recipe 1: 3×105 + 2×105 = 525
    // Recipe 2: 5×210 = 1050
    // Recipe 1 wins
    expect(result.root.recipe!.recipeId).toBe(1)
    expect(result.root.unitCost).toBe(525)
  })

  test('filters recipes by job level', () => {
    const cache = new Map([
      [100, itemData(100, [listing(2000)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(50)])],
    ])
    // Job 8 (Carpenter) at level 40 — too low for recipe 1 (lvl 50)
    // Job 9 (Blacksmith) at level 60 — high enough for recipe 2 (lvl 55)
    const result = solveCraftingCost(100, cache, new Map(), {
      jobLevels: { 8: 40, 9: 60 },
    })!
    // Only recipe 2 eligible: 5×50×1.05 = 262.5
    expect(result.root.recipe!.recipeId).toBe(2)
    expect(result.root.unitCost).toBe(262.5)
  })

  test('falls back to buy when all recipes filtered by job level', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    // Both jobs too low
    const result = solveCraftingCost(100, cache, new Map(), {
      jobLevels: { 8: 10, 9: 10 },
    })!
    expect(result.root.action).toBe('buy')
    expect(result.root.unitCost).toBeCloseTo(630)  // 600×1.05
  })

  test('diamond dependency: shared sub-ingredient has consistent cost', () => {
    const cache = new Map([
      [400, itemData(400, [listing(2000)])],
      [401, itemData(401, [listing(300)])],
      [402, itemData(402, [listing(400)])],
      [500, itemData(500, [listing(100)])],
    ])
    const result = solveCraftingCost(400, cache, new Map())!
    // Item 401: 2×100×1.05 = 210 (craft) vs 300×1.05=315 (buy) → craft at 210
    // Item 402: 3×100×1.05 = 315 (craft) vs 400×1.05=420 (buy) → craft at 315
    // Item 400: 210 + 315 = 525
    expect(result.root.action).toBe('craft')
    expect(result.root.unitCost).toBe(525)
    const ing401 = result.root.recipe!.ingredients.find(n => n.itemId === 401)!
    const ing402 = result.root.recipe!.ingredients.find(n => n.itemId === 402)!
    expect(ing401.action).toBe('craft')
    expect(ing401.unitCost).toBeCloseTo(210)
    expect(ing402.action).toBe('craft')
    expect(ing402.unitCost).toBeCloseTo(315)
    // Both sub-recipes use item 500 at the same unit cost
    const sub500_from_401 = ing401.recipe!.ingredients[0]!
    const sub500_from_402 = ing402.recipe!.ingredients[0]!
    expect(sub500_from_401.unitCost).toBeCloseTo(105)
    expect(sub500_from_402.unitCost).toBeCloseTo(105)
  })

  test('depth cap forces buy at max depth', () => {
    const cache = new Map([
      [700, itemData(700, [listing(1000)])],
      [701, itemData(701, [listing(500)])],
      [702, itemData(702, [listing(300)])],
      [10, itemData(10, [listing(100)])],
    ])
    // With maxDepth=2: depth 0=700, depth 1=701, depth 2=702 → no craft eval
    const result = solveCraftingCost(700, cache, new Map(), { maxDepth: 2 })!
    // 702 forced to buy at 300×1.05 = 315
    // 701: craft = 315, buy = 500×1.05 = 525 → craft at 315
    // 700: craft = 315, buy = 1000×1.05 = 1050 → craft at 315
    expect(result.root.action).toBe('craft')
    expect(result.root.unitCost).toBeCloseTo(315)
    const ing701 = result.root.recipe!.ingredients[0]!
    expect(ing701.action).toBe('craft')
    const ing702 = ing701.recipe!.ingredients[0]!
    expect(ing702.action).toBe('buy')
    expect(ing702.unitCost).toBeCloseTo(315)
    expect(ing702.recipe).toBeUndefined()
  })

  test('depth-capped node is not memoized, so shallower occurrence still evaluates crafting', () => {
    // Item 800 → [801, 802]. Item 801 → [802]. Item 802 → [10].
    // With maxDepth=2: DFS processes 801 first, which recurses to 802 at depth 2.
    // At depth 2, 802 is depth-capped → forced to buy (300×1.05 = 315).
    // Then 800's second ingredient is 802 at depth 1 — should evaluate crafting.
    // 802 craft cost: 1×100×1.05 = 105. Buy: 300×1.05 = 315. Craft wins at 105.
    const cache = new Map([
      [800, itemData(800, [listing(2000)])],
      [801, itemData(801, [listing(500)])],
      [802, itemData(802, [listing(300)])],
      [10, itemData(10, [listing(100)])],
    ])
    const result = solveCraftingCost(800, cache, new Map(), { maxDepth: 2 })!
    // 802 at depth 1 (direct child of 800): should craft at 105, not buy at 315
    const ing802 = result.root.recipe!.ingredients.find(n => n.itemId === 802)!
    expect(ing802.action).toBe('craft')
    expect(ing802.unitCost).toBeCloseTo(105)
    // 802 at depth 2 (via 801): should still be depth-capped to buy
    const ing801 = result.root.recipe!.ingredients.find(n => n.itemId === 801)!
    const deep802 = ing801.recipe!.ingredients.find(n => n.itemId === 802)!
    expect(deep802.action).toBe('buy')
    expect(deep802.unitCost).toBeCloseTo(315)
  })

  test('market buy confidence uses exponential decay', () => {
    const cache2 = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100, WORLD_A, 'TestWorld')], {
        worldUploadTimes: { [WORLD_A]: STALE_20H },
      })],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache2, new Map())!
    const ing10 = result.root.recipe!.ingredients.find(n => n.itemId === 10)!
    // confidence = exp(-20/12) ≈ 0.189
    expect(ing10.confidence).toBeCloseTo(Math.exp(-20 / 12), 2)
  })

  test('vendor confidence is always 1.0', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(200)])],  // expensive, vendor wins
      [12, itemData(12, [listing(200)])],
    ])
    const vendors = new Map([[11, 80]])
    const result = solveCraftingCost(100, cache, vendors)!
    const ing11 = result.root.recipe!.ingredients.find(n => n.itemId === 11)!
    expect(ing11.action).toBe('vendor')
    expect(ing11.confidence).toBe(1)
  })

  test('craft confidence is min of ingredient confidences', () => {
    const cache = new Map([
      [100, itemData(100, [listing(2000)])],
      [10, itemData(10, [listing(100, WORLD_A, 'TestWorld')], {
        worldUploadTimes: { [WORLD_A]: STALE_20H },  // stale → low confidence
      })],
      [11, itemData(11, [listing(100)])],  // fresh → high confidence
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    expect(result.root.action).toBe('craft')
    // Root confidence = min of ingredient confidences
    // ing 10: exp(-20/12) ≈ 0.189, ing 11: exp(-0.5/12) ≈ 0.959
    // min = 0.189
    expect(result.root.confidence).toBeCloseTo(Math.exp(-20 / 12), 2)
    expect(result.confidence).toBeCloseTo(Math.exp(-20 / 12), 2)
  })

  test('no market data gives confidence 0', () => {
    // Item with a recipe but one ingredient has no market data or vendor
    const cache = new Map([
      [100, itemData(100, [listing(2000)])],
      [10, itemData(10, [listing(100)])],
      // Item 11 NOT in cache
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // Recipe 1 needs item 11 which has no data → unitCost=Infinity, conf=0
    // Recipe 2: 5×200×1.05 = 1050
    // Recipe 2 wins because recipe 1 has Infinity cost
    expect(result.root.recipe!.recipeId).toBe(2)
  })

  test('cheapestListing includes buy tax', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600, WORLD_A), listing(500, HOME, '利維坦')])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // Cheapest listing across all worlds: 500 on HOME
    expect(result.cheapestListing!.price).toBeCloseTo(525)  // 500×1.05
    expect(result.cheapestListing!.world).toBe('利維坦')
  })

  test('realisticSellPrice uses min of home listing and median history', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600, HOME, '利維坦')], {
        recentHistory: [
          { pricePerUnit: 550, quantity: 1, timestamp: FRESH, hq: false },
          { pricePerUnit: 500, quantity: 1, timestamp: FRESH, hq: false },
          { pricePerUnit: 700, quantity: 1, timestamp: FRESH, hq: false },
        ],
      })],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // Home listing: 600. Median history: 550 (sorted: 500, 550, 700 → middle).
    // realisticSellPrice = min(600, 550) = 550
    expect(result.realisticSellPrice).toBe(550)
  })

  test('profitVsBuy and profitVsSell computed correctly', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600, HOME, '利維坦')])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // totalCost = 525 (craft recipe 1)
    // cheapestListing = 600×1.05 = 630
    // profitVsBuy = 630 - 525 = 105 (crafting saves 105 gil)
    expect(result.profitVsBuy).toBeCloseTo(105)
    // realisticSellPrice = 600 (home listing, no history)
    // profitVsSell = 600×0.95 - 525 = 570 - 525 = 45 (after sell tax)
    expect(result.profitVsSell).toBeCloseTo(45)
  })

  test('returns null for item with only companyCraft recipes', () => {
    const cache = new Map([
      [600, itemData(600, [listing(100)])],
      [10, itemData(10, [listing(50)])],
    ])
    expect(solveCraftingCost(600, cache, new Map())).toBeNull()
  })

  test('populates itemName from nameMap on all nodes', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const nameMap = new Map([
      [100, '青銅裝飾鐵鎚'],
      [10, '銅礦'],
      [11, '錫礦'],
    ])
    const result = solveCraftingCost(100, cache, new Map(), { nameMap })!
    // Root node gets its name
    expect(result.root.itemName).toBe('青銅裝飾鐵鎚')
    // Ingredient nodes get their names
    const ing10 = result.root.recipe!.ingredients.find(n => n.itemId === 10)!
    expect(ing10.itemName).toBe('銅礦')
    const ing11 = result.root.recipe!.ingredients.find(n => n.itemId === 11)!
    expect(ing11.itemName).toBe('錫礦')
  })

  test('itemName falls back to undefined when nameMap omitted', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    expect(result.root.itemName).toBeUndefined()
  })

  test('null cheapestListing when item has no market data', () => {
    // Item 100 has recipes but no market listing
    const cache = new Map([
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    expect(result.cheapestListing).toBeNull()
    expect(result.realisticSellPrice).toBeNull()
    expect(result.profitVsBuy).toBeNull()
    expect(result.profitVsSell).toBeNull()
  })

  test('leaf ingredient with no data gets Infinity cost and confidence 0', () => {
    // Only recipe 2 ingredients in cache (item 12), recipe 1 ingredients missing
    const cache = new Map([
      [100, itemData(100, [listing(2000)])],
      [12, itemData(12, [listing(100)])],
    ])
    const result = solveCraftingCost(100, cache, new Map())!
    // Recipe 1: item 10 and 11 missing → Infinity cost
    // Recipe 2: 5×100×1.05 = 525
    // Recipe 2 wins
    expect(result.root.recipe!.recipeId).toBe(2)
    expect(result.root.unitCost).toBe(525)
  })
})

describe('solveCraftCostBatch', () => {
  test('returns CraftCostEntry for each craftable item', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
      [200, itemData(200, [listing(250)])],
      [13, itemData(13, [listing(100)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())

    // Item 100: craft at 525 (recipe 1: 3×100×1.05 + 2×100×1.05 = 525)
    const entry100 = results.get(100)!
    expect(entry100).toBeDefined()
    expect(entry100.recipeId).toBe(1)
    expect(entry100.craftCost).toBe(525)
    expect(entry100.job).toBe(8)
    expect(entry100.level).toBe(50)

    // Item 200: craft at 210 (6×100×1.05 / 3 yields = 210)
    const entry200 = results.get(200)!
    expect(entry200).toBeDefined()
    expect(entry200.craftCost).toBe(210)
  })

  test('excludes items where buy is cheaper than craft', () => {
    const cache = new Map([
      [100, itemData(100, [listing(10)])],  // very cheap to buy
      [10, itemData(10, [listing(500)])],
      [11, itemData(11, [listing(500)])],
      [12, itemData(12, [listing(500)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())
    // Item 100: buy at 10.5 is cheaper than any recipe → action='buy', no entry
    expect(results.has(100)).toBe(false)
  })

  test('excludes companyCraft-only items', () => {
    const cache = new Map([
      [600, itemData(600, [listing(100)])],
      [10, itemData(10, [listing(50)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())
    // Item 600 only has companyCraft recipe
    expect(results.has(600)).toBe(false)
  })

  test('shared memo: diamond dependency solved once', () => {
    const cache = new Map([
      [400, itemData(400, [listing(2000)])],
      [401, itemData(401, [listing(300)])],
      [402, itemData(402, [listing(400)])],
      [500, itemData(500, [listing(100)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())
    // 401: craft 2×105=210 < buy 315
    // 402: craft 3×105=315 < buy 420
    // 400: craft 210+315=525 < buy 2100
    expect(results.get(400)!.craftCost).toBe(525)
    expect(results.get(401)!.craftCost).toBeCloseTo(210)
    expect(results.get(402)!.craftCost).toBeCloseTo(315)
  })

  test('no depth cap: deep DAG fully resolved', () => {
    const cache = new Map([
      [700, itemData(700, [listing(1000)])],
      [701, itemData(701, [listing(500)])],
      [702, itemData(702, [listing(300)])],
      [10, itemData(10, [listing(100)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())
    // 702: craft 1×105=105 < buy 315
    // 701: craft 1×105=105 < buy 525
    // 700: craft 1×105=105 < buy 1050
    expect(results.get(702)!.craftCost).toBeCloseTo(105)
    expect(results.get(701)!.craftCost).toBeCloseTo(105)
    expect(results.get(700)!.craftCost).toBeCloseTo(105)
  })

  test('uses vendor prices when cheaper', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(200)])],
      [12, itemData(12, [listing(200)])],
    ])
    const vendors = new Map([[11, 80]])
    const results = solveCraftCostBatch(cache, vendors)
    // Recipe 1: 3×105 + 2×80 = 315+160 = 475
    expect(results.get(100)!.craftCost).toBe(475)
  })
})
