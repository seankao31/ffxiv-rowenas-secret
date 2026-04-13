import { test, expect, describe, vi, afterEach } from 'vitest'
import { computePriceStats } from '$lib/client/price-stats'
import type { Sale } from '$lib/shared/types'

function makeSale(overrides: Partial<Sale> & { timestamp: number }): Sale {
  return {
    pricePerUnit: 100,
    quantity: 1,
    worldID: 4030,
    worldName: '利維坦',
    hq: false,
    buyerName: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('computePriceStats', () => {
  test('returns null for empty array', () => {
    expect(computePriceStats([])).toBeNull()
  })

  test('computes min price', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [
      makeSale({ pricePerUnit: 300, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 100, timestamp: 1700000200_000 }),
      makeSale({ pricePerUnit: 500, timestamp: 1700000100_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.minPrice).toBe(100)
  })

  test('computes median price with odd count', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [
      makeSale({ pricePerUnit: 300, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 100, timestamp: 1700000200_000 }),
      makeSale({ pricePerUnit: 500, timestamp: 1700000100_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.medianPrice).toBe(300)
  })

  test('computes median price with even count', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000500_000))
    const sales = [
      makeSale({ pricePerUnit: 100, timestamp: 1700000400_000 }),
      makeSale({ pricePerUnit: 200, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 300, timestamp: 1700000200_000 }),
      makeSale({ pricePerUnit: 400, timestamp: 1700000100_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.medianPrice).toBe(250)
  })

  test('computes revenue-weighted average', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [
      makeSale({ pricePerUnit: 100, quantity: 10, timestamp: 1700000300_000 }),
      makeSale({ pricePerUnit: 200, quantity: 5, timestamp: 1700000200_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.avgPrice).toBeCloseTo(133.33, 1)
  })

  test('computes 24h volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const sales = [
      makeSale({ quantity: 10, timestamp: now - 3600_000 }),
      makeSale({ quantity: 5, timestamp: now - 80000_000 }),
      makeSale({ quantity: 20, timestamp: now - 90000_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.volume24h).toBe(15)
  })

  test('computes 7d volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const DAY = 86400_000
    const sales = [
      makeSale({ quantity: 10, timestamp: now - 1 * DAY }),
      makeSale({ quantity: 5, timestamp: now - 3 * DAY }),
      makeSale({ quantity: 20, timestamp: now - 8 * DAY }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.volume7d).toBe(15)
  })

  test('splits HQ and NQ volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const sales = [
      makeSale({ quantity: 10, hq: true, timestamp: now - 3600_000 }),
      makeSale({ quantity: 5, hq: false, timestamp: now - 7200_000 }),
      makeSale({ quantity: 3, hq: true, timestamp: now - 10800_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.hqVolume24h).toBe(13)
    expect(stats.nqVolume24h).toBe(5)
    expect(stats.hqVolume7d).toBe(13)
    expect(stats.nqVolume7d).toBe(5)
  })

  test('single entry works', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1700000400_000))
    const sales = [makeSale({ pricePerUnit: 500, quantity: 3, timestamp: 1700000300_000 })]
    const stats = computePriceStats(sales)!
    expect(stats.minPrice).toBe(500)
    expect(stats.medianPrice).toBe(500)
    expect(stats.avgPrice).toBe(500)
  })

  test('all HQ sales have zero NQ volume', () => {
    vi.useFakeTimers()
    const now = 1700100000_000
    vi.setSystemTime(new Date(now))
    const sales = [
      makeSale({ quantity: 10, hq: true, timestamp: now - 3600_000 }),
      makeSale({ quantity: 5, hq: true, timestamp: now - 7200_000 }),
    ]
    const stats = computePriceStats(sales)!
    expect(stats.nqVolume24h).toBe(0)
    expect(stats.nqVolume7d).toBe(0)
    expect(stats.hqVolume24h).toBe(15)
    expect(stats.hqVolume7d).toBe(15)
  })
})
