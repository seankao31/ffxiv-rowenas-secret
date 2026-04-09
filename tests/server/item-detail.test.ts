import { test, expect, describe, afterEach } from 'vitest'
import { setNameMap, waitForNameCache, _resetNameCacheState } from '$lib/server/cache'

// Import the load function from the route module
import { load } from '../../src/routes/item/[id]/+page.server'

afterEach(() => {
  setNameMap(new Map())
  _resetNameCacheState()
})

describe('item detail load', () => {
  test('returns item ID and TW name when found in cache', async () => {
    setNameMap(new Map([[2394, '棉線']]))
    const result = await load({ params: { id: '2394' } } as any)
    expect(result).toEqual({ itemID: 2394, twName: '棉線' })
  })

  test('returns null twName when item not in cache', async () => {
    setNameMap(new Map([[1, 'placeholder']]))
    const result = await load({ params: { id: '9999' } } as any)
    expect(result).toEqual({ itemID: 9999, twName: null })
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
