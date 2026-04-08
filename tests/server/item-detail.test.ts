import { test, expect, describe, afterEach } from 'vitest'
import { setNameMap } from '$lib/server/cache'

// Import the load function from the route module
import { load } from '../../src/routes/item/[id]/+page.server'

afterEach(() => {
  setNameMap(new Map())
})

describe('item detail load', () => {
  test('returns item ID and TW name when found in cache', () => {
    setNameMap(new Map([[2394, '棉線']]))
    const result = load({ params: { id: '2394' } } as any)
    expect(result).toEqual({ itemID: 2394, twName: '棉線' })
  })

  test('returns null twName when item not in cache', () => {
    setNameMap(new Map())
    const result = load({ params: { id: '9999' } } as any)
    expect(result).toEqual({ itemID: 9999, twName: null })
  })

  test('throws 400 for non-integer id', () => {
    expect(() => load({ params: { id: 'abc' } } as any)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  test('throws 400 for negative id', () => {
    expect(() => load({ params: { id: '-1' } } as any)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  test('throws 400 for zero id', () => {
    expect(() => load({ params: { id: '0' } } as any)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  test('throws 400 for decimal id', () => {
    expect(() => load({ params: { id: '2.5' } } as any)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })
})
