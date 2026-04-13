import { test, expect, describe } from 'vitest'
import { seedFixtureData } from '$lib/server/fixtures/seed'
import { getAllItems, getNameMap, isCacheReady, getScanMeta } from '$lib/server/cache'

describe('seedFixtureData', () => {
  test('populates item cache from snapshot', () => {
    seedFixtureData()

    const items = getAllItems()
    expect(items.size).toBeGreaterThan(0)

    const first = items.values().next().value!
    expect(first.itemID).toBeTypeOf('number')
    expect(first.listings.length).toBeGreaterThan(0)
    expect(first.regularSaleVelocity).toBeTypeOf('number')
  })

  test('populates name cache from snapshot', () => {
    seedFixtureData()

    const names = getNameMap()
    expect(names.size).toBeGreaterThan(0)

    const items = getAllItems()
    const firstId = items.keys().next().value!
    expect(names.get(firstId)).toBeTypeOf('string')
  })

  test('marks cache as ready', () => {
    seedFixtureData()

    expect(isCacheReady()).toBe(true)

    const meta = getScanMeta()
    expect(meta.scanCompletedAt).toBeGreaterThan(0)
    expect(meta.itemsScanned).toBeGreaterThan(0)
  })
})
