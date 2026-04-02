// tests/server/universalis.test.ts
import { test, expect, describe, mock, afterEach } from 'bun:test'
import { Semaphore, fetchMarketableItems, fetchDCListings, fetchWorldListings, fetchItemNames } from '../../src/server/universalis.ts'

describe('fetchMarketableItems', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test('returns array of item IDs when API responds with valid data', async () => {
    const expected = [2, 3, 4, 1337, 99999]
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(expected), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchMarketableItems()

    expect(result).toEqual(expected)
  })

  test('returns empty array when API returns HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchMarketableItems()

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[universalis] HTTP 500, skipping:'))
  })

  test('returns empty array when API returns non-array JSON', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchMarketableItems()

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('[universalis] /marketable returned unexpected shape:', 'object')
  })
})

// Helper: build a minimal DC batch response for one item
function dcResponse(itemID: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    itemIDs: [itemID],
    items: {
      [itemID]: {
        itemID,
        lastUploadTime: 1_774_271_896_711,
        listings: [],
        worldUploadTimes: {},
        recentHistory: [],
        ...extra,
      },
    },
    unresolvedItems: [],
  })
}

describe('fetchDCListings', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test('converts listing lastReviewTime from API seconds to milliseconds', async () => {
    globalThis.fetch = mock(async () =>
      new Response(dcResponse(2, {
        listings: [{
          lastReviewTime: 1_774_271_895,   // seconds from API
          pricePerUnit: 100, quantity: 1,
          worldID: 4028, worldName: '伊弗利特', hq: false,
        }],
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchDCListings([2])

    expect(result[0].listings[0].lastReviewTime).toBe(1_774_271_895 * 1000)
  })

  test('extracts worldUploadTimes from DC response', async () => {
    globalThis.fetch = mock(async () =>
      new Response(dcResponse(2, {
        worldUploadTimes: { '4028': 1_774_271_896_711, '4029': 1_774_274_109_636 },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchDCListings([2])

    expect(result[0].worldUploadTimes).toEqual({ '4028': 1_774_271_896_711, '4029': 1_774_274_109_636 })
  })

  test('returns empty array when API returns HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchDCListings([2])

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[universalis] HTTP 500, skipping:'))
  })
})

// Helper: build a minimal single-world batch response (no worldID/worldName —
// the single-world API omits them; fetchWorldListings injects them)
function worldResponse(items: Record<number, Record<string, unknown>>) {
  const ids = Object.keys(items).map(Number)
  const entries: Record<string, unknown> = {}
  for (const [id, extra] of Object.entries(items)) {
    entries[id] = {
      itemID: Number(id),
      lastUploadTime: 1_774_271_896_711,
      listings: [],
      recentHistory: [],
      ...extra,
    }
  }
  return JSON.stringify({ itemIDs: ids, items: entries, unresolvedItems: [] })
}

describe('fetchWorldListings', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test('returns listings with worldID and worldName injected', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: {
          listings: [{
            lastReviewTime: 1_774_271_895,
            pricePerUnit: 500, quantity: 3,
            hq: false,
          }],
        },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4028, name: '伊弗利特' },
      [2],
    )

    expect(result.length).toBe(1)
    expect(result[0].itemID).toBe(2)
    expect(result[0].listings[0].worldID).toBe(4028)
    expect(result[0].listings[0].worldName).toBe('伊弗利特')
    expect(result[0].listings[0].lastReviewTime).toBe(1_774_271_895 * 1000)
  })

  test('populates worldUploadTimes from item lastUploadTime', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({ 2: {} }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4028, name: '伊弗利特' },
      [2],
    )

    expect(result[0].worldUploadTimes).toEqual({ 4028: 1_774_271_896_711 })
  })

  test('handles multi-item batch with correct per-item results', async () => {
    globalThis.fetch = mock(async () =>
      new Response(worldResponse({
        2: { listings: [{ lastReviewTime: 100, pricePerUnit: 10, quantity: 1, hq: false }] },
        3: { listings: [{ lastReviewTime: 200, pricePerUnit: 20, quantity: 5, hq: true }] },
      }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4034, name: '拉姆' },
      [2, 3],
    )

    expect(result.length).toBe(2)
    const item2 = result.find(r => r.itemID === 2)!
    const item3 = result.find(r => r.itemID === 3)!
    expect(item2.listings[0].worldID).toBe(4034)
    expect(item2.listings[0].worldName).toBe('拉姆')
    expect(item3.listings[0].worldID).toBe(4034)
    expect(item3.listings[0].hq).toBe(true)
  })

  test('returns empty array when API returns HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchWorldListings(
      { id: 4028, name: '伊弗利特' },
      [2],
    )

    expect(result).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[universalis] HTTP 500, skipping:'))
  })
})

describe('fetchItemNames', () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  const originalLog = console.log

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    console.log = originalLog
  })

  test('decodes msgpack tw-items into id→name map', async () => {
    console.log = mock(() => {}) as typeof console.log
    const { encode } = await import('@msgpack/msgpack')
    const mockData = {
      '2': { tw: '火之碎晶' },
      '7': { tw: '水之碎晶' },
    }
    globalThis.fetch = mock(async () =>
      new Response(encode(mockData), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(2)
    expect(result.get(2)).toBe('火之碎晶')
    expect(result.get(7)).toBe('水之碎晶')
    expect(console.log).toHaveBeenCalledWith('[universalis] Loaded 2 item names from FFXIV_Market')
  })

  test('skips entries with falsy tw field', async () => {
    console.log = mock(() => {}) as typeof console.log
    const { encode } = await import('@msgpack/msgpack')
    const mockData = {
      '2': { tw: '火之碎晶' },
      '3': { tw: '' },
      '4': { tw: null },
    }
    globalThis.fetch = mock(async () =>
      new Response(encode(mockData), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(1)
    expect(result.get(2)).toBe('火之碎晶')
    expect(result.has(3)).toBe(false)
    expect(result.has(4)).toBe(false)
    expect(console.log).toHaveBeenCalledWith('[universalis] Loaded 1 item names from FFXIV_Market')
  })

  test('returns empty map on HTTP error', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(0)
    expect(console.warn).toHaveBeenCalledWith('[universalis] Failed to fetch item names: HTTP 500')
  })

  test('returns empty map on corrupt msgpack payload', async () => {
    console.warn = mock(() => {}) as typeof console.warn
    globalThis.fetch = mock(async () =>
      new Response(new Uint8Array([0xff, 0xfe, 0x00]), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(0)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[universalis] Failed to decode item names:'))
  })
})

describe('Semaphore', () => {
  test('never exceeds max concurrent', async () => {
    const sem = new Semaphore(3)
    let concurrent = 0
    let maxConcurrent = 0
    const tasks = Array.from({ length: 10 }, () =>
      sem.run(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(r => setTimeout(r, 10))
        concurrent--
      })
    )
    await Promise.all(tasks)
    expect(maxConcurrent).toBeLessThanOrEqual(3)
    expect(maxConcurrent).toBeGreaterThan(0)
  })
})

describe('RateLimiter (limiter library)', () => {
  test('allows burst up to rate', async () => {
    const { RateLimiter } = await import('limiter')
    const limiter = new RateLimiter({ tokensPerInterval: 100, interval: 'second' })
    // Should be able to acquire 10 tokens immediately (well within 100/s budget)
    for (let i = 0; i < 10; i++) {
      await limiter.removeTokens(1)
    }
    expect(true).toBe(true)
  })

  test('delays when token bucket is exhausted', async () => {
    const { RateLimiter } = await import('limiter')
    const limiter = new RateLimiter({ tokensPerInterval: 10, interval: 'second' })
    // Drain the initial tokens
    for (let i = 0; i < 10; i++) await limiter.removeTokens(1)
    // Next acquire should wait ~100ms
    const start = Date.now()
    await limiter.removeTokens(1)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThan(50)  // generous lower bound
  })
})
