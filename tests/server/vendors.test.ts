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

function mockFetch(responses: Array<{ ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  let callIndex = 0
  globalThis.fetch = vi.fn(() => {
    const response = responses[callIndex++]!
    return Promise.resolve(response as unknown as Response)
  }) as unknown as typeof fetch
}

function suppressLogs() {
  console.warn = vi.fn()
  console.log = vi.fn()
}

describe('fetchVendorPrices', () => {
  test('paginates GilShopItem sheet and fetches item prices', async () => {
    suppressLogs()
    mockFetch([
      // Page 1 of GilShopItem
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 4718 } } },
          ],
          next: '2.0',
        }),
      },
      // Page 2 of GilShopItem (last page)
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 2, fields: { Item: { row_id: 10976 } } },
          ],
        }),
      },
      // Item price batch
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 120 } },
            { row_id: 10976, fields: { PriceMid: 8925 } },
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(3)
    expect(prices.get(5057)).toBe(63)
    expect(prices.get(4718)).toBe(120)
    expect(prices.get(10976)).toBe(8925)
  })

  test('deduplicates item IDs across multiple GilShopItem rows', async () => {
    suppressLogs()
    mockFetch([
      // Same item appears in two shops
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 5057 } } },
            { row_id: 2, fields: { Item: { row_id: 4718 } } },
          ],
        }),
      },
      // Item price batch — only 2 unique items fetched
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 120 } },
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()

    expect(prices.size).toBe(2)
    // Item batch should contain only unique IDs
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const itemBatchUrl = calls[1]![0] as string
    expect(itemBatchUrl).toContain('rows=5057,4718')
    expect(itemBatchUrl).not.toMatch(/5057.*5057/) // no duplicates
  })

  test('skips rows with missing or zero item ID', async () => {
    suppressLogs()
    mockFetch([
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 0 } } },      // zero ID
            { row_id: 2, fields: {} },                              // missing Item
          ],
        }),
      },
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
  })

  test('skips items with zero or missing PriceMid', async () => {
    suppressLogs()
    mockFetch([
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 0, fields: { Item: { row_id: 5057 } } },
            { row_id: 1, fields: { Item: { row_id: 4718 } } },
          ],
        }),
      },
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { row_id: 5057, fields: { PriceMid: 63 } },
            { row_id: 4718, fields: { PriceMid: 0 } },   // zero price
          ],
        }),
      },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(1)
    expect(prices.get(5057)).toBe(63)
  })

  test('returns empty map when GilShopItem fetch fails', async () => {
    suppressLogs()
    mockFetch([
      { ok: false, status: 500, json: () => Promise.resolve({}) },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })

  test('retries a failed batch and succeeds', async () => {
    suppressLogs()
    let itemBatchCalls = 0

    globalThis.fetch = vi.fn((url: string | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('GilShopItem')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            rows: [{ row_id: 0, fields: { Item: { row_id: 5057 } } }],
          }),
        } as unknown as Response)
      }
      if (urlStr.includes('sheet/Item')) {
        itemBatchCalls++
        if (itemBatchCalls === 1) {
          return Promise.resolve({ ok: false, status: 500 } as Response)
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            rows: [{ row_id: 5057, fields: { PriceMid: 63 } }],
          }),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }) as unknown as typeof fetch

    const prices = await fetchVendorPrices()
    expect(prices.get(5057)).toBe(63)
    expect(itemBatchCalls).toBe(2)
  })

  test('throws after exhausting batch retries', async () => {
    suppressLogs()
    mockFetch([
      {
        ok: true,
        json: () => Promise.resolve({
          rows: [{ row_id: 0, fields: { Item: { row_id: 5057 } } }],
        }),
      },
      // All retries fail
      { ok: false, status: 500, json: () => Promise.resolve({}) },
      { ok: false, status: 500, json: () => Promise.resolve({}) },
      { ok: false, status: 500, json: () => Promise.resolve({}) },
    ])

    await expect(fetchVendorPrices()).rejects.toThrow()
  })

  test('returns empty map when GilShopItem has no rows', async () => {
    suppressLogs()
    mockFetch([
      { ok: true, json: () => Promise.resolve({ rows: [] }) },
    ])

    const prices = await fetchVendorPrices()
    expect(prices.size).toBe(0)
  })
})
