// tests/client/vendors.test.ts
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest'
import { fetchVendorInfo, getVendorInfo, setOnChange, _clearCache } from '$lib/client/vendors'

const originalFetch = globalThis.fetch
const originalWarn = console.warn

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
  setOnChange(null)
})

beforeEach(() => {
  _clearCache()
})

// Based on actual Garland Tools API response format
const GARLAND_ITEM_RESPONSE = {
  item: {
    id: 5057,
    vendors: [1005633, 1005640],
  },
  partials: [
    { type: 'npc', id: '1005633', obj: { i: 1005633, n: 'Material Supplier', l: 425, s: 3, c: [11.04, 11.4] } },
    { type: 'npc', id: '1005640', obj: { i: 1005640, n: 'Material Supplier', l: 427, s: 3, c: [10.97, 8.96] } },
    { type: 'npc', id: '1000999', obj: { i: 1000999, n: 'Soemrwyb', l: 28 } },  // Not a vendor for this item
  ],
}

const GARLAND_DATA_RESPONSE = {
  locationIndex: {
    '425': { id: 425, name: 'Mist' },
    '427': { id: 427, name: 'The Goblet' },
    '28': { id: 28, name: 'Limsa Lominsa Upper Decks' },
  },
}

function mockFetchResponses(responses: Record<string, unknown>) {
  globalThis.fetch = vi.fn((url: string | URL) => {
    const urlStr = String(url)
    for (const [pattern, data] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        } as Response)
      }
    }
    return Promise.resolve({ ok: false, status: 404 } as Response)
  }) as unknown as typeof fetch
}

describe('fetchVendorInfo', () => {
  test('fetches and caches vendor info with zone names', async () => {
    mockFetchResponses({
      'get.php': GARLAND_ITEM_RESPONSE,
      'data.json': GARLAND_DATA_RESPONSE,
    })

    await fetchVendorInfo(5057)
    const info = getVendorInfo(5057)

    expect(info).toHaveLength(2)
    expect(info![0]!.npcName).toBe('Material Supplier')
    expect(info![0]!.zone).toBe('Mist')
    expect(info![1]!.npcName).toBe('Material Supplier')
    expect(info![1]!.zone).toBe('The Goblet')
  })

  test('returns undefined for uncached item', () => {
    expect(getVendorInfo(99999)).toBeUndefined()
  })

  test('skips already-cached items', async () => {
    mockFetchResponses({
      'get.php': GARLAND_ITEM_RESPONSE,
      'data.json': GARLAND_DATA_RESPONSE,
    })

    await fetchVendorInfo(5057)
    await fetchVendorInfo(5057) // second call should skip

    // Only one call to get.php (data.json call is separate)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const itemCalls = calls.filter(c => String(c[0]).includes('get.php'))
    expect(itemCalls).toHaveLength(1)
  })

  test('handles item fetch failure gracefully', async () => {
    console.warn = vi.fn()
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as unknown as typeof fetch

    await fetchVendorInfo(5057)
    expect(getVendorInfo(5057)).toBeUndefined()
  })

  test('handles item with no vendors', async () => {
    mockFetchResponses({
      'get.php': { item: { id: 9999, vendors: [] }, partials: [] },
      'data.json': GARLAND_DATA_RESPONSE,
    })

    await fetchVendorInfo(9999)
    expect(getVendorInfo(9999)).toEqual([])
  })

  test('falls back to location ID when data.json fetch fails', async () => {
    console.warn = vi.fn()
    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('get.php')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(GARLAND_ITEM_RESPONSE),
        } as Response)
      }
      // data.json fails
      return Promise.resolve({ ok: false, status: 500 } as Response)
    }) as unknown as typeof fetch

    await fetchVendorInfo(5057)
    const info = getVendorInfo(5057)

    expect(info).toHaveLength(2)
    expect(info![0]!.zone).toBe('Zone 425')  // fallback
    expect(info![1]!.zone).toBe('Zone 427')
  })

  test('retries data.json after non-OK response instead of caching empty map', async () => {
    console.warn = vi.fn()
    let dataCallCount = 0

    const SECOND_ITEM_RESPONSE = {
      item: { id: 9999, vendors: [1005633] },
      partials: [
        { type: 'npc', id: '1005633', obj: { i: 1005633, n: 'Material Supplier', l: 425 } },
      ],
    }

    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('get.php')) {
        // Return different items based on the ID in the URL
        const data = urlStr.includes('id=9999') ? SECOND_ITEM_RESPONSE : GARLAND_ITEM_RESPONSE
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        } as Response)
      }
      if (urlStr.includes('data.json')) {
        dataCallCount++
        if (dataCallCount === 1) {
          // First call: non-OK response
          return Promise.resolve({ ok: false, status: 503 } as Response)
        }
        // Second call: success
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(GARLAND_DATA_RESPONSE),
        } as Response)
      }
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }) as unknown as typeof fetch

    // First fetch — data.json returns 503, zone falls back to ID
    await fetchVendorInfo(5057)
    expect(getVendorInfo(5057)![0]!.zone).toBe('Zone 425')

    // Second fetch (different item) — data.json should be retried and succeed
    await fetchVendorInfo(9999)
    expect(getVendorInfo(9999)![0]!.zone).toBe('Mist')
    expect(dataCallCount).toBe(2)
  })

  test('calls onChange callback after successful fetch', async () => {
    mockFetchResponses({
      'get.php': GARLAND_ITEM_RESPONSE,
      'data.json': GARLAND_DATA_RESPONSE,
    })

    const cb = vi.fn()
    setOnChange(cb)

    await fetchVendorInfo(5057)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  test('deduplicates concurrent data.json fetches', async () => {
    mockFetchResponses({
      'get.php': GARLAND_ITEM_RESPONSE,
      'data.json': GARLAND_DATA_RESPONSE,
    })

    // Fetch two different items concurrently
    await Promise.all([fetchVendorInfo(5057), fetchVendorInfo(5057)])

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const dataCalls = calls.filter(c => String(c[0]).includes('data.json'))
    expect(dataCalls).toHaveLength(1)
  })

  test('deduplicates concurrent item fetches for the same item', async () => {
    mockFetchResponses({
      'get.php': GARLAND_ITEM_RESPONSE,
      'data.json': GARLAND_DATA_RESPONSE,
    })

    // Fire two concurrent fetches for the same uncached item
    await Promise.all([fetchVendorInfo(5057), fetchVendorInfo(5057)])

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const itemCalls = calls.filter(c => String(c[0]).includes('get.php'))
    expect(itemCalls).toHaveLength(1)
  })

  test('suppresses retries for a failed item fetch during cooldown', async () => {
    console.warn = vi.fn()
    let fetchCount = 0

    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('get.php')) {
        fetchCount++
        return Promise.resolve({ ok: false, status: 500 } as Response)
      }
      if (urlStr.includes('data.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(GARLAND_DATA_RESPONSE),
        } as Response)
      }
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }) as unknown as typeof fetch

    // First fetch fails
    await fetchVendorInfo(5057)
    expect(fetchCount).toBe(1)

    // Immediate retry should be suppressed
    await fetchVendorInfo(5057)
    expect(fetchCount).toBe(1)
  })

  test('only fetches NPC partials that match vendor IDs', async () => {
    mockFetchResponses({
      'get.php': GARLAND_ITEM_RESPONSE,
      'data.json': GARLAND_DATA_RESPONSE,
    })

    await fetchVendorInfo(5057)
    const info = getVendorInfo(5057)

    // Should have 2 vendors, not 3 (Soemrwyb is not a vendor for this item)
    expect(info).toHaveLength(2)
    expect(info!.every(v => v.npcName === 'Material Supplier')).toBe(true)
  })
})
