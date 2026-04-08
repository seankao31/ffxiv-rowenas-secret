// tests/server/vendors.test.ts
import { test, expect, describe, afterEach, vi } from 'vitest'
import { fetchVendorPrices } from '$lib/server/vendors'

const originalFetch = globalThis.fetch
const originalWarn = console.warn
const originalLog = console.log

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
  console.log = originalLog
})

function suppressLogs() {
  console.warn = vi.fn()
  console.log = vi.fn()
}

/** Mock XIVAPI with a single page of GilShopItem rows + item price responses. */
function mockVendorApi(opts: {
  gilShopItems: Array<{ row_id: number; subrow_id?: number; fields: Record<string, unknown> }>
  itemPrices: Array<{ row_id: number; fields: { PriceMid: number } }>
  itemBatchFailures?: number
}) {
  let itemBatchCalls = 0
  globalThis.fetch = vi.fn((url: string | URL) => {
    const urlStr = String(url)
    if (urlStr.includes('GilShopItem')) {
      // First page returns data; subsequent pages return empty (single-page mock)
      if (!urlStr.includes('after=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: opts.gilShopItems }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rows: [] }),
      } as unknown as Response)
    }
    if (urlStr.includes('sheet/Item')) {
      itemBatchCalls++
      if (opts.itemBatchFailures && itemBatchCalls <= opts.itemBatchFailures) {
        return Promise.resolve({ ok: false, status: 500 } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rows: opts.itemPrices }),
      } as unknown as Response)
    }
    return Promise.resolve({ ok: false, status: 404 } as Response)
  }) as unknown as typeof fetch
}

describe('fetchVendorPrices', () => {
  test('paginates GilShopItem sheet and fetches item prices', async () => {
    suppressLogs()

    // SheetResponse has no `next` field — pagination uses after=row_id:subrow_id
    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('GilShopItem')) {
        if (!urlStr.includes('after=')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              rows: [
                { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
                { row_id: 262144, subrow_id: 1, fields: { Item: { row_id: 4718 } } },
              ],
            }),
          } as unknown as Response)
        }
        if (urlStr.includes('after=262144%3A1') || urlStr.includes('after=262144:1')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              rows: [
                { row_id: 262145, subrow_id: 0, fields: { Item: { row_id: 10976 } } },
              ],
            }),
          } as unknown as Response)
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [] }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 120 } },
            { row_id: 10976, fields: { PriceMid: 8925 } },
          ],
        }),
      } as unknown as Response)
    }) as unknown as typeof fetch

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(3)
    expect(prices.get(5057)).toBe(63)
    expect(prices.get(4718)).toBe(120)
    expect(prices.get(10976)).toBe(8925)
  })

  test('deduplicates item IDs across multiple GilShopItem rows', async () => {
    suppressLogs()
    mockVendorApi({
      gilShopItems: [
        { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
        { row_id: 262144, subrow_id: 1, fields: { Item: { row_id: 5057 } } },
        { row_id: 262144, subrow_id: 2, fields: { Item: { row_id: 4718 } } },
      ],
      itemPrices: [
        { row_id: 5057, fields: { PriceMid: 63 } },
        { row_id: 4718, fields: { PriceMid: 120 } },
      ],
    })

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(2)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const itemBatchCall = calls.find(c => String(c[0]).includes('sheet/Item'))
    expect(String(itemBatchCall![0])).toContain('rows=5057,4718')
    expect(String(itemBatchCall![0])).not.toMatch(/5057.*5057/) // no duplicates
  })

  test('skips rows with missing or zero item ID', async () => {
    suppressLogs()
    mockVendorApi({
      gilShopItems: [
        { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
        { row_id: 262144, subrow_id: 1, fields: { Item: { row_id: 0 } } },      // zero ID
        { row_id: 262144, subrow_id: 2, fields: {} },                              // missing Item
      ],
      itemPrices: [
        { row_id: 5057, fields: { PriceMid: 63 } },
      ],
    })

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
  })

  test('skips items with zero or missing PriceMid', async () => {
    suppressLogs()
    mockVendorApi({
      gilShopItems: [
        { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
        { row_id: 262144, subrow_id: 1, fields: { Item: { row_id: 4718 } } },
      ],
      itemPrices: [
        { row_id: 5057, fields: { PriceMid: 63 } },
        { row_id: 4718, fields: { PriceMid: 0 } },   // zero price
      ],
    })

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
  })

  test('excludes blocklisted false-positive item IDs', async () => {
    suppressLogs()
    mockVendorApi({
      gilShopItems: [
        { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
        { row_id: 262144, subrow_id: 1, fields: { Item: { row_id: 13266 } } },  // blocklisted
        { row_id: 262144, subrow_id: 2, fields: { Item: { row_id: 4599 } } },   // blocklisted
      ],
      itemPrices: [
        { row_id: 5057, fields: { PriceMid: 63 } },
      ],
    })

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
    expect(prices.has(13266)).toBe(false)
    expect(prices.has(4599)).toBe(false)
  })

  test('returns empty map when GilShopItem fetch fails', async () => {
    suppressLogs()
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 } as Response),
    ) as unknown as typeof fetch

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })

  test('retries a failed batch and succeeds', async () => {
    suppressLogs()
    mockVendorApi({
      gilShopItems: [
        { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
      ],
      itemPrices: [
        { row_id: 5057, fields: { PriceMid: 63 } },
      ],
      itemBatchFailures: 1,
    })

    const prices = await fetchVendorPrices()
    expect(prices.get(5057)).toBe(63)
  })

  test('throws after exhausting batch retries', async () => {
    suppressLogs()
    mockVendorApi({
      gilShopItems: [
        { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
      ],
      itemPrices: [],
      itemBatchFailures: 999, // always fail
    })

    await expect(fetchVendorPrices()).rejects.toThrow()
  })

  test('paginates subrow sheets using row_id:subrow_id cursor (no next field)', async () => {
    suppressLogs()

    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('GilShopItem')) {
        if (!urlStr.includes('after=')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              rows: [
                { row_id: 262144, subrow_id: 0, fields: { Item: { row_id: 5057 } } },
                { row_id: 262144, subrow_id: 1, fields: { Item: { row_id: 4718 } } },
              ],
            }),
          } as unknown as Response)
        }
        if (urlStr.includes('after=262144%3A1') || urlStr.includes('after=262144:1')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              rows: [
                { row_id: 262145, subrow_id: 0, fields: { Item: { row_id: 10976 } } },
              ],
            }),
          } as unknown as Response)
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [] }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 120 } },
            { row_id: 10976, fields: { PriceMid: 8925 } },
          ],
        }),
      } as unknown as Response)
    }) as unknown as typeof fetch

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(3)
    expect(prices.get(5057)).toBe(63)
    expect(prices.get(4718)).toBe(120)
    expect(prices.get(10976)).toBe(8925)

    // Verify item 10976 (page 2 only) was included in the price batch request
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const itemBatchCall = calls.find(c => String(c[0]).includes('sheet/Item'))
    expect(itemBatchCall).toBeDefined()
    expect(String(itemBatchCall![0])).toContain('10976')
  })

  test('returns empty map when GilShopItem has no rows', async () => {
    suppressLogs()
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rows: [] }),
      } as unknown as Response),
    ) as unknown as typeof fetch

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })
})
