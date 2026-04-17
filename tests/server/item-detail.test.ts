import { test, expect, describe, afterEach, vi } from 'vitest'
import {
  setNameMap,
  setItem,
  getAllItems,
  waitForNameCache,
  _resetNameCacheState,
} from '$lib/server/cache'
import * as recipeModule from '$lib/server/recipes'
import type { ItemData } from '$lib/shared/types'

// Import the load function from the route module
import { load } from '../../src/routes/item/[id]/+page.server'

afterEach(() => {
  setNameMap(new Map())
  getAllItems().clear()
  _resetNameCacheState()
  vi.restoreAllMocks()
})

function makeItem(itemID: number): ItemData {
  return {
    itemID,
    worldUploadTimes: {},
    homeLastUploadTime: 0,
    listings: [],
    regularSaleVelocity: 0,
    hqSaleVelocity: 0,
    recentHistory: [],
  }
}

describe('item detail load', () => {
  test('returns item ID, TW name, and hasRecipe when craftable', async () => {
    vi.spyOn(recipeModule, 'getRecipesByResult').mockReturnValue([
      { id: 1, result: 2394, job: 8, lvl: 50, yields: 1, ingredients: [] },
    ])
    setNameMap(new Map([[2394, '棉線']]))
    const result = await load({ params: { id: '2394' } } as any)
    expect(result.itemID).toBe(2394)
    expect(result.twName).toBe('棉線')
    expect(result.hasRecipe).toBe(true)
  })

  test('returns hasRecipe false when item not craftable', async () => {
    vi.spyOn(recipeModule, 'getRecipesByResult').mockReturnValue([])
    setNameMap(new Map([[9999, 'non-craftable']]))
    const result = await load({ params: { id: '9999' } } as any)
    expect(result.itemID).toBe(9999)
    expect(result.twName).toBe('non-craftable')
    expect(result.hasRecipe).toBe(false)
  })

  test('throws 400 for non-integer id', async () => {
    await expect(load({ params: { id: 'abc' } } as any)).rejects.toMatchObject({ status: 400 })
  })

  test('throws 400 for negative id', async () => {
    await expect(load({ params: { id: '-1' } } as any)).rejects.toMatchObject({ status: 400 })
  })

  test('throws 400 for zero id', async () => {
    await expect(load({ params: { id: '0' } } as any)).rejects.toMatchObject({ status: 400 })
  })

  test('throws 400 for decimal id', async () => {
    await expect(load({ params: { id: '2.5' } } as any)).rejects.toMatchObject({ status: 400 })
  })

  test('returns twName null when item in scanner cache but not name map', async () => {
    vi.spyOn(recipeModule, 'getRecipesByResult').mockReturnValue([])
    // Settle waitForNameCache with an unrelated name so 12345 is name-map-absent.
    setNameMap(new Map([[1, 'unrelated']]))
    setItem(makeItem(12345))
    const result = await load({ params: { id: '12345' } } as any)
    expect(result.itemID).toBe(12345)
    expect(result.twName).toBe(null)
    expect(result.hasRecipe).toBe(false)
  })

  test('throws 404 when ID is in neither name map nor item cache', async () => {
    vi.spyOn(recipeModule, 'getRecipesByResult').mockReturnValue([])
    setNameMap(new Map([[1, 'unrelated']]))
    await expect(load({ params: { id: '9999999' } } as any))
      .rejects.toMatchObject({ status: 404 })
  })

  test('throws 503 when both name map and item cache are settled empty', async () => {
    vi.spyOn(recipeModule, 'getRecipesByResult').mockReturnValue([])
    setNameMap(new Map())  // settles waitForNameCache with empty result
    await expect(load({ params: { id: '12345' } } as any))
      .rejects.toMatchObject({ status: 503 })
  })
})

describe('waitForNameCache', () => {
  test('resolves immediately when cache is populated', async () => {
    setNameMap(new Map([[1, 'test']]))
    await waitForNameCache()
  })

  test('waits until cache is populated', async () => {
    let resolved = false
    const promise = waitForNameCache().then(() => { resolved = true })

    // Not yet resolved — cache is empty
    await Promise.resolve()
    expect(resolved).toBe(false)

    // Populate the cache — promise resolves
    setNameMap(new Map([[1, 'test']]))
    await promise
    expect(resolved).toBe(true)
  })

  test('resolves when cache loading fails (empty map)', async () => {
    let resolved = false
    const promise = waitForNameCache().then(() => { resolved = true })

    // Not yet resolved — setNameMap hasn't been called
    await Promise.resolve()
    expect(resolved).toBe(false)

    // Simulate failed load — empty map still resolves the promise
    setNameMap(new Map())
    await promise
    expect(resolved).toBe(true)
  })
})
