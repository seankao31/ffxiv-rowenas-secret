import { test, expect, describe } from 'vitest'
import { toggleSort, type SortState } from '$lib/client/sort'

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
