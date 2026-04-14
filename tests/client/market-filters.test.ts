import { test, expect, describe } from 'vitest'
import { applyMarketFilters } from '$lib/client/market-filters'

const items = [
  { worldName: '利維坦', hq: true, price: 100 },
  { worldName: '伊弗利特', hq: false, price: 200 },
  { worldName: '利維坦', hq: false, price: 300 },
  { worldName: '鳳凰', hq: true, price: 400 },
]

describe('applyMarketFilters', () => {
  test('returns all items when no filters active', () => {
    const result = applyMarketFilters(items, 'all', false)
    expect(result).toEqual(items)
  })

  test('filters by world', () => {
    const result = applyMarketFilters(items, '利維坦', false)
    expect(result).toEqual([
      { worldName: '利維坦', hq: true, price: 100 },
      { worldName: '利維坦', hq: false, price: 300 },
    ])
  })

  test('filters by HQ only', () => {
    const result = applyMarketFilters(items, 'all', true)
    expect(result).toEqual([
      { worldName: '利維坦', hq: true, price: 100 },
      { worldName: '鳳凰', hq: true, price: 400 },
    ])
  })

  test('filters by both world and HQ', () => {
    const result = applyMarketFilters(items, '利維坦', true)
    expect(result).toEqual([
      { worldName: '利維坦', hq: true, price: 100 },
    ])
  })

  test('returns empty array when nothing matches', () => {
    const noMatch = applyMarketFilters(items, '伊弗利特', true)
    expect(noMatch).toEqual([])
  })

  test('returns empty array for empty input', () => {
    const result = applyMarketFilters([], 'all', false)
    expect(result).toEqual([])
  })
})
