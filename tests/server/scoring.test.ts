// tests/server/scoring.test.ts
import { test, expect, describe } from 'vitest'
import { scoreOpportunities } from '$lib/server/scoring'
import type { ItemData, ThresholdParams } from '$lib/shared/types'

const HOME = 4030
const SRC_A = 4033  // 巴哈姆特
const SRC_B = 4032  // 奧汀

const DEFAULT: ThresholdParams = {
  price_threshold: 2.0,
  days_of_supply: 3,
  limit: 50,
  hq: false,
}

const NOW = Date.now()
const FRESH = NOW - 30 * 60_000        // 30 min ago
const STALE20H = NOW - 20 * 3_600_000  // 20 hours ago

function item(overrides: Partial<ItemData> = {}): ItemData {
  return {
    itemID: 1,
    worldUploadTimes: { [HOME]: FRESH, [SRC_B]: FRESH },
    homeLastUploadTime: FRESH,
    listings: [
      { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
      { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
    ],
    regularSaleVelocity: 10,
    hqSaleVelocity: 5,
    recentHistory: [],
    ...overrides,
  }
}

const names = new Map([[1, 'Iron Ore'], [2, 'Steel Ingot']])

describe('scoreOpportunities', () => {
  test('returns opportunity for profitable item', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.itemID).toBe(1)
    expect(r.itemName).toBe('Iron Ore')
    expect(r.profitPerUnit).toBe(530)  // 1000*0.95 - 400*1.05 = 530 (includes 5% purchase tax)
    expect(r.buyPrice).toBe(420)       // 400 * 1.05 (actual cost with purchase tax)
    expect(r.sourceWorldID).toBe(SRC_B)
  })

  test('excludes item when no profitable source world', () => {
    const noProfit = item({
      listings: [
        { pricePerUnit: 500, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 600, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    // profit = 500*0.95 - 600 = -125 → skip
    expect(scoreOpportunities(new Map([[1, noProfit]]), names, DEFAULT)).toHaveLength(0)
  })

  test('excludes item with zero velocity', () => {
    expect(
      scoreOpportunities(new Map([[1, item({ regularSaleVelocity: 0 })]]), names, DEFAULT)
    ).toHaveLength(0)
  })

  test('item with no home listings but sale history produces opportunity with zero competitors', () => {
    const noHome = item({
      listings: [
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      recentHistory: [
        { pricePerUnit: 1000, quantity: 1, timestamp: FRESH, hq: false },
        { pricePerUnit: 900, quantity: 1, timestamp: FRESH, hq: false },
        { pricePerUnit: 1100, quantity: 1, timestamp: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, noHome]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.activeCompetitorCount).toBe(0)
    // realisticSellPrice = min(Infinity, median=1000) = 1000
    expect(results[0]!.sellPrice).toBe(1000)
    // No home listings → listingPrice is null (genuinely no listing to reference)
    expect(results[0]!.listingPrice).toBeNull()
    expect(results[0]!.listingProfitPerUnit).toBeNull()
  })

  test('item with no home listings and no sale history but positive velocity is excluded', () => {
    const noHome = item({
      listings: [
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      // positive velocity but no home listings and no sale history → no sell price signal
    })
    const results = scoreOpportunities(new Map([[1, noHome]]), names, DEFAULT)
    expect(results).toHaveLength(0)
  })

  test('item with no home listings and no sale history is excluded by velocity', () => {
    const noHome = item({
      listings: [
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    expect(scoreOpportunities(new Map([[1, noHome]]), names, DEFAULT)).toHaveLength(0)
  })

  test('stale home listings still produce opportunity with low confidence', () => {
    const STALE50H = NOW - 50 * 3_600_000
    const staleHome = item({
      worldUploadTimes: { [HOME]: STALE50H, [SRC_B]: FRESH },
      homeLastUploadTime: STALE50H,
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: STALE50H, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, staleHome]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.homeConfidence).toBeLessThan(0.001)
    expect(results[0]!.profitPerUnit).toBe(530)
  })

  test('source world uses cheapest listing regardless of price spread', () => {
    const withExpensive = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 1200, quantity: 99, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, withExpensive]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.buyPrice).toBe(420)  // cheapest price 400 * 1.05
  })

  test('picks confidence-adjusted best world, not cheapest', () => {
    const twoWorlds: ItemData = {
      itemID: 1,
      worldUploadTimes: {
        [HOME]: FRESH,
        [SRC_A]: STALE20H,  // cheap but 20h old → low confidence
        [SRC_B]: FRESH,     // pricier but fresh → high confidence
      },
      homeLastUploadTime: FRESH,
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 300, quantity: 3, worldID: SRC_A, worldName: '巴哈姆特', lastReviewTime: STALE20H, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 10,
      hqSaleVelocity: 5,
      recentHistory: [],
    }
    const results = scoreOpportunities(new Map([[1, twoWorlds]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    // 奧汀 (SRC_B) should win despite higher buy price — fresh data
    expect(results[0]!.sourceWorldID).toBe(SRC_B)
    // 巴哈姆特 (SRC_A) should appear as alt — higher raw profit
    expect(results[0]!.altSourceWorldID).toBe(SRC_A)
  })

  test('no alt world when only one profitable source', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results[0]!.altSourceWorld).toBeUndefined()
  })

  test('hq=true uses hqSaleVelocity and filters to HQ listings only', () => {
    const mixed: ItemData = {
      ...item(),
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: true },
        { pricePerUnit: 800, quantity: 2, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: true },
        { pricePerUnit: 200, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      hqSaleVelocity: 4,
    }
    const results = scoreOpportunities(new Map([[1, mixed]]), names, { ...DEFAULT, hq: true })
    expect(results).toHaveLength(1)
    expect(results[0]!.buyPrice).toBe(420)   // HQ source price 400 * 1.05 purchase tax
    expect(results[0]!.sellPrice).toBe(1000) // HQ home price
    // fairShareVelocity = hqSaleVelocity(4) / (1 HQ competitor + 1) = 2
    expect(results[0]!.fairShareVelocity).toBeCloseTo(2)
  })

  test('recommendedUnits capped by days_of_supply', () => {
    const plenty: ItemData = {
      ...item(),
      regularSaleVelocity: 10,
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 100, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    }
    const results = scoreOpportunities(new Map([[1, plenty]]), names, { ...DEFAULT, days_of_supply: 3 })
    // fairShare = 10 / 2 = 5/day; maxUnits = ceil(5 * 3) = 15
    expect(results[0]!.recommendedUnits).toBe(15)
    expect(results[0]!.availableUnits).toBe(100)
  })

  test('respects limit parameter', () => {
    const cache = new Map<number, ItemData>()
    for (let i = 1; i <= 10; i++) {
      cache.set(i, {
        ...item({ itemID: i }),
        listings: [
          { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
          { pricePerUnit: 400 - i, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
        ],
      })
    }
    const nameMap = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, `Item ${i + 1}`]))
    const results = scoreOpportunities(cache, nameMap, { ...DEFAULT, limit: 5 })
    expect(results).toHaveLength(5)
  })
})

describe('NPC vendor pricing', () => {
  const vendorPrices = new Map([[1, 300]])

  test('NPC as primary source when cheaper than all cross-world sources', () => {
    const data = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 500, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    // NPC: profit = 1000*0.95 - 300 = 650 (no buy tax)
    // 奧汀: profit = 1000*0.95 - 500*1.05 = 425
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, vendorPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('NPC')
    expect(results[0]!.sourceWorldID).toBe(0)
    expect(results[0]!.buyPrice).toBe(300)
    expect(results[0]!.profitPerUnit).toBe(650)
    expect(results[0]!.sourceConfidence).toBe(1)
    expect(results[0]!.sourceDataAgeHours).toBe(0)
  })

  test('NPC as alt source when cross-world has higher score', () => {
    const data = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 200, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const expensiveVendor = new Map([[1, 800]])
    // 奧汀: profit = 1000*0.95 - 200*1.05 = 740
    // NPC: profit = 1000*0.95 - 800 = 150
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, expensiveVendor)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.altSourceWorld).toBe('NPC')
    expect(results[0]!.altBuyPrice).toBe(800)
  })

  test('NPC excluded when vendor price yields no profit', () => {
    const data = item({
      listings: [
        { pricePerUnit: 500, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const expensiveVendor = new Map([[1, 600]])
    // NPC: profit = 500*0.95 - 600 = -125 → excluded
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, expensiveVendor)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.altSourceWorld).toBeUndefined()
  })

  test('item not in vendor map behaves unchanged', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, new Map())
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.profitPerUnit).toBe(530)
  })

  test('undefined vendorPrices behaves unchanged', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('奧汀')
    expect(results[0]!.profitPerUnit).toBe(530)
  })

  test('NPC buy price has zero tax', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, vendorPrices)
    expect(results[0]!.sourceWorld).toBe('NPC')
    // buyPrice = vendorPrice (no * 1.05 tax)
    expect(results[0]!.buyPrice).toBe(300)
    // profitPerUnit = 1000*0.95 - 300 = 650 (no buy tax)
    expect(results[0]!.profitPerUnit).toBe(650)
  })

  test('NPC has unlimited available units (sentinel -1)', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, vendorPrices)
    expect(results[0]!.sourceWorld).toBe('NPC')
    expect(results[0]!.availableUnits).toBe(-1)
    // recommendedUnits not capped by availableUnits
    // fairShareVelocity = 10 / (1+1) = 5, maxUnits = ceil(5 * 3) = 15
    expect(results[0]!.recommendedUnits).toBe(15)
  })

  test('NPC as sole source when no cross-world listings exist', () => {
    const homeOnly = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, homeOnly]]), names, DEFAULT, vendorPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceWorld).toBe('NPC')
    expect(results[0]!.buyPrice).toBe(300)
    expect(results[0]!.altSourceWorld).toBeUndefined()
  })
})

describe('vendor-sell scoring', () => {
  test('vendor-sell surfaces item with no home listings', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('vendor')
    expect(results[0]!.sellPrice).toBe(500)
    expect(results[0]!.buyPrice).toBe(210)    // 200 × 1.05
    expect(results[0]!.profitPerUnit).toBe(290) // 500 - 210
    expect(results[0]!.homeConfidence).toBe(1.0)
    expect(results[0]!.homeDataAgeHours).toBe(0)
    expect(results[0]!.activeCompetitorCount).toBe(0)
  })

  test('vendor-sell can use home world as buy source', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 10, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('vendor')
    expect(results[0]!.sourceWorldID).toBe(HOME)
    expect(results[0]!.sourceWorld).toBe('利維坦')
  })

  test('vendor-sell replaces MB-sell when it scores higher', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 100, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0.1,
    })
    const vendorSellPrices = new Map([[1, 300]])
    // MB-sell score is tiny (velocity 0.1, turnover penalty)
    // Vendor-sell: profit = 300 - 105 = 195, score ≈ 195
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('vendor')
    expect(results[0]!.sellPrice).toBe(300)
  })

  test('MB-sell wins when it scores higher than vendor-sell', () => {
    const data = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 10,
    })
    // Vendor sell barely profitable
    const vendorSellPrices = new Map([[1, 430]])
    // MB-sell: profit 530, high velocity → high score
    // Vendor-sell: profit = 430 - 420 = 10, score ≈ 10
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('mb')
  })

  test('vendor-sell has no sell-side tax', () => {
    const data = item({
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    // profit = 500 (no tax) - 200 * 1.05 = 290
    expect(results[0]!.profitPerUnit).toBe(290)
  })

  test('vendor-sell excluded when no profitable source listing', () => {
    const data = item({
      listings: [
        { pricePerUnit: 600, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
      regularSaleVelocity: 0,
    })
    // buy = 630 > sell = 500 → no profit
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(0)
  })

  test('item without vendor sell price uses MB-sell only', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT, undefined, new Map())
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('mb')
  })

  test('vendor-sell score is profitPerUnit × sourceConfidence', () => {
    const data: ItemData = {
      itemID: 1,
      worldUploadTimes: { [SRC_B]: STALE20H },
      homeLastUploadTime: 0,
      listings: [
        { pricePerUnit: 200, quantity: 5, worldID: SRC_B, worldName: '奧汀', lastReviewTime: STALE20H, hq: false },
      ],
      regularSaleVelocity: 0,
      hqSaleVelocity: 0,
      recentHistory: [],
    }
    const vendorSellPrices = new Map([[1, 500]])
    const results = scoreOpportunities(new Map([[1, data]]), names, DEFAULT, undefined, vendorSellPrices)
    expect(results).toHaveLength(1)
    // profit = 290, sourceConf = exp(-20/12) ≈ 0.189
    const expectedScore = 290 * Math.exp(-20 / 12)
    expect(results[0]!.score).toBeCloseTo(expectedScore, 0)
  })

  test('regular opportunity has sellDestination mb', () => {
    const results = scoreOpportunities(new Map([[1, item()]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.sellDestination).toBe('mb')
  })
})
