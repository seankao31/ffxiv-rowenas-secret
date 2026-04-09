import { test, expect, describe, afterEach, vi } from 'vitest'
import { fetchItemListings } from '$lib/client/universalis'

const originalFetch = globalThis.fetch
const originalWarn = console.warn

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
})

// Universalis single-item DC response shape
const UNIVERSALIS_RESPONSE = {
  listings: [
    { lastReviewTime: 1700000300, pricePerUnit: 500, quantity: 10, worldID: 4030, worldName: '利維坦', hq: false },
    { lastReviewTime: 1700000200, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: true },
    { lastReviewTime: 1700000100, pricePerUnit: 800, quantity: 1, worldID: 4031, worldName: '鳳凰', hq: false },
  ],
}

describe('fetchItemListings', () => {
  test('fetches listings from Universalis DC endpoint and maps response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/v2/')
    expect(url).toContain('%E9%99%B8%E8%A1%8C%E9%B3%A5') // DC_NAME '陸行鳥' URL-encoded
    expect(url).toContain('2394')
    expect(listings).toHaveLength(3)
  })

  test('converts lastReviewTime from seconds to milliseconds', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    for (const listing of listings) {
      expect(listing.lastReviewTime).toBeGreaterThan(1_000_000_000_000)
    }
  })

  test('returns listings sorted by pricePerUnit ascending', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(listings[0].pricePerUnit).toBe(200)
    expect(listings[1].pricePerUnit).toBe(500)
    expect(listings[2].pricePerUnit).toBe(800)
  })

  test('maps all Listing fields correctly', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(UNIVERSALIS_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)
    const cheapest = listings[0]

    expect(cheapest).toEqual({
      pricePerUnit: 200,
      quantity: 5,
      worldID: 4028,
      worldName: '伊弗利特',
      lastReviewTime: 1700000200 * 1000,
      hq: true,
    })
  })

  test('throws on network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error')
    }) as unknown as typeof fetch

    await expect(fetchItemListings(2394)).rejects.toThrow('Network error')
  })

  test('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('', { status: 500 }),
    ) as unknown as typeof fetch

    await expect(fetchItemListings(2394)).rejects.toThrow('HTTP 500')
  })

  test('returns empty array when listings field is missing', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch

    const listings = await fetchItemListings(2394)

    expect(listings).toEqual([])
  })
})
