import type { ThresholdParams } from '$lib/shared/types.ts'

export function parseThresholds(query: Record<string, unknown>): ThresholdParams | { error: string } {
  const price_threshold = query['price_threshold'] !== undefined
    ? Number(query['price_threshold']) : 2.0
  const listing_staleness_hours = query['listing_staleness_hours'] !== undefined
    ? Number(query['listing_staleness_hours']) : 48
  const days_of_supply = query['days_of_supply'] !== undefined
    ? Number(query['days_of_supply']) : 3
  const limit = query['limit'] !== undefined ? Number(query['limit']) : 50
  const hq = query['hq'] === 'true'

  if (isNaN(price_threshold) || price_threshold < 1.0 || price_threshold > 10.0)
    return { error: 'price_threshold must be between 1.0 and 10.0' }
  if (isNaN(listing_staleness_hours) || listing_staleness_hours < 1 || listing_staleness_hours > 720)
    return { error: 'listing_staleness_hours must be between 1 and 720' }
  if (isNaN(days_of_supply) || days_of_supply < 1 || days_of_supply > 30)
    return { error: 'days_of_supply must be between 1 and 30' }
  if (isNaN(limit) || limit < 1 || limit > 200)
    return { error: 'limit must be between 1 and 200' }

  return { price_threshold, listing_staleness_hours, days_of_supply, limit, hq }
}
