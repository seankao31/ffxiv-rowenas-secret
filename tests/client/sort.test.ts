import { test, expect, describe } from 'vitest'
import { toggleSort, sortOpportunities, type SortState } from '$lib/client/sort'
import type { Opportunity } from '$lib/shared/types'

describe('toggleSort', () => {
  const cleared: SortState = { column: null, direction: 'desc' }

  test('clicking a column from cleared state sets it to default direction', () => {
    const result = toggleSort(cleared, 'profitPerUnit')
    expect(result).toEqual({ column: 'profitPerUnit', direction: 'desc' })
  })

  test('clicking activeCompetitorCount defaults to asc', () => {
    const result = toggleSort(cleared, 'activeCompetitorCount')
    expect(result).toEqual({ column: 'activeCompetitorCount', direction: 'asc' })
  })

  test('clicking active column in default direction reverses it', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'desc' }
    const result = toggleSort(state, 'profitPerUnit')
    expect(result).toEqual({ column: 'profitPerUnit', direction: 'asc' })
  })

  test('clicking active column in reversed direction clears sort', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'asc' }
    const result = toggleSort(state, 'profitPerUnit')
    expect(result).toEqual({ column: null, direction: 'desc' })
  })

  test('clicking a different column switches to that columns default direction', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'desc' }
    const result = toggleSort(state, 'expectedDailyProfit')
    expect(result).toEqual({ column: 'expectedDailyProfit', direction: 'desc' })
  })

  test('switching columns from reversed direction resets to new column default direction', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'asc' }
    const result = toggleSort(state, 'expectedDailyProfit')
    expect(result).toEqual({ column: 'expectedDailyProfit', direction: 'desc' })
  })

  test('full three-click cycle for activeCompetitorCount (asc default)', () => {
    const s1 = toggleSort(cleared, 'activeCompetitorCount')
    expect(s1).toEqual({ column: 'activeCompetitorCount', direction: 'asc' })

    const s2 = toggleSort(s1, 'activeCompetitorCount')
    expect(s2).toEqual({ column: 'activeCompetitorCount', direction: 'desc' })

    const s3 = toggleSort(s2, 'activeCompetitorCount')
    expect(s3).toEqual({ column: null, direction: 'desc' })
  })
})

// Minimal Opportunity factory — only fields the sort logic touches
function opp(overrides: Partial<Opportunity> & { score: number }): Opportunity {
  return {
    itemID: 1, itemName: '', buyPrice: 0, sellPrice: 0, listingPrice: 0,
    profitPerUnit: 0, listingProfitPerUnit: 0, sourceWorld: '', sourceWorldID: 0,
    availableUnits: 0, recommendedUnits: 0, expectedDailyProfit: 0, score: 0,
    homeDataAgeHours: 0, homeConfidence: 1, sourceDataAgeHours: 0, sourceConfidence: 1,
    activeCompetitorCount: 0, fairShareVelocity: 0,
    ...overrides,
  }
}

describe('sortOpportunities', () => {
  const items = [
    opp({ itemID: 1, profitPerUnit: 100, expectedDailyProfit: 500, activeCompetitorCount: 3, fairShareVelocity: 2.0, score: 80 }),
    opp({ itemID: 2, profitPerUnit: 300, expectedDailyProfit: 200, activeCompetitorCount: 1, fairShareVelocity: 0.5, score: 90 }),
    opp({ itemID: 3, profitPerUnit: 200, expectedDailyProfit: 200, activeCompetitorCount: 1, fairShareVelocity: 1.0, score: 70 }),
  ]

  test('returns original order when column is null', () => {
    const result = sortOpportunities(items, { column: null, direction: 'desc' })
    expect(result.map(o => o.itemID)).toEqual([1, 2, 3])
  })

  test('sorts by profitPerUnit desc', () => {
    const result = sortOpportunities(items, { column: 'profitPerUnit', direction: 'desc' })
    expect(result.map(o => o.itemID)).toEqual([2, 3, 1])
  })

  test('sorts by profitPerUnit asc', () => {
    const result = sortOpportunities(items, { column: 'profitPerUnit', direction: 'asc' })
    expect(result.map(o => o.itemID)).toEqual([1, 3, 2])
  })

  test('sorts by activeCompetitorCount asc with score tiebreaker', () => {
    // items 2 and 3 both have count=1; item 2 has higher score (90 vs 70)
    const result = sortOpportunities(items, { column: 'activeCompetitorCount', direction: 'asc' })
    expect(result.map(o => o.itemID)).toEqual([2, 3, 1])
  })

  test('sorts by expectedDailyProfit desc with score tiebreaker', () => {
    // items 2 and 3 both have 200; item 2 has higher score (90 vs 70)
    const result = sortOpportunities(items, { column: 'expectedDailyProfit', direction: 'desc' })
    expect(result.map(o => o.itemID)).toEqual([1, 2, 3])
  })

  test('does not mutate the original array', () => {
    const copy = [...items]
    sortOpportunities(items, { column: 'profitPerUnit', direction: 'desc' })
    expect(items.map(o => o.itemID)).toEqual(copy.map(o => o.itemID))
  })
})
