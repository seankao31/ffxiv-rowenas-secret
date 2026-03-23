// tests/server/scoring.test.ts
import { test, expect, describe } from 'bun:test'
import { scoreOpportunities } from '../../src/server/scoring.ts'
import type { ItemData, ThresholdParams } from '../../src/shared/types.ts'

const HOME = 4030
const SRC_A = 4033  // 巴哈姆特
const SRC_B = 4032  // 奧汀

const DEFAULT: ThresholdParams = {
  price_threshold: 2.0,
  listing_staleness_hours: 48,
  days_of_supply: 3,
  limit: 50,
  hq: false,
}

const NOW = Date.now()
const FRESH = NOW - 30 * 60_000        // 30 min ago
const STALE20H = NOW - 20 * 3_600_000  // 20 hours ago
const TOO_OLD = NOW - 50 * 3_600_000   // 50 hours ago (beyond 48h staleness cutoff)

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
    expect(r.profitPerUnit).toBe(550)  // 1000*0.95 - 400 = 550
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

  test('excludes item with no home-world listings at all', () => {
    const noHome = item({
      listings: [
        // Only source-world listing — no home listing
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    expect(scoreOpportunities(new Map([[1, noHome]]), names, DEFAULT)).toHaveLength(0)
  })

  test('excludes item when all home listings are too old', () => {
    const staleHome = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: TOO_OLD, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    expect(scoreOpportunities(new Map([[1, staleHome]]), names, DEFAULT)).toHaveLength(0)
  })

  test('dead listing price threshold: only counts listings within 2× cheapest as active', () => {
    const withDead = item({
      listings: [
        { pricePerUnit: 1000, quantity: 5, worldID: HOME, worldName: '利維坦', lastReviewTime: FRESH, hq: false },
        { pricePerUnit: 400, quantity: 3, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
        // Dead listing at 3× cheapest on source — outside 2× threshold, excluded from active
        { pricePerUnit: 1200, quantity: 99, worldID: SRC_B, worldName: '奧汀', lastReviewTime: FRESH, hq: false },
      ],
    })
    const results = scoreOpportunities(new Map([[1, withDead]]), names, DEFAULT)
    expect(results).toHaveLength(1)
    expect(results[0]!.buyPrice).toBe(400)  // cheapest active price unaffected
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
    expect(results[0]!.buyPrice).toBe(400)   // HQ source price
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
