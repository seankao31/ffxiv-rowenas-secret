import type { Sale } from '$lib/shared/types'

export type PriceStatsResult = {
  minPrice: number
  medianPrice: number
  avgPrice: number
  volume24h: number
  volume7d: number
  hqVolume24h: number
  nqVolume24h: number
  hqVolume7d: number
  nqVolume7d: number
}

export function computePriceStats(sales: Sale[]): PriceStatsResult | null {
  if (sales.length === 0) return null

  const prices = sales.map(s => s.pricePerUnit).sort((a, b) => a - b)
  const minPrice = prices[0]!
  const mid = Math.floor(prices.length / 2)
  const medianPrice = prices.length % 2 === 1
    ? prices[mid]!
    : (prices[mid - 1]! + prices[mid]!) / 2

  const totalRevenue = sales.reduce((sum, s) => sum + s.pricePerUnit * s.quantity, 0)
  const totalQty = sales.reduce((sum, s) => sum + s.quantity, 0)
  const avgPrice = totalRevenue / totalQty

  const now = Date.now()
  const DAY = 86400_000
  const cutoff24h = now - DAY
  const cutoff7d = now - 7 * DAY

  let volume24h = 0, volume7d = 0
  let hqVolume24h = 0, nqVolume24h = 0
  let hqVolume7d = 0, nqVolume7d = 0

  for (const s of sales) {
    if (s.timestamp >= cutoff7d) {
      volume7d += s.quantity
      if (s.hq) hqVolume7d += s.quantity
      else nqVolume7d += s.quantity
    }
    if (s.timestamp >= cutoff24h) {
      volume24h += s.quantity
      if (s.hq) hqVolume24h += s.quantity
      else nqVolume24h += s.quantity
    }
  }

  return {
    minPrice, medianPrice, avgPrice,
    volume24h, volume7d,
    hqVolume24h, nqVolume24h,
    hqVolume7d, nqVolume7d,
  }
}
