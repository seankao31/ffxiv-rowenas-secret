// src/client/lib/api.ts
import type { Opportunity, ScanMeta, ThresholdParams } from '../../shared/types.ts'

export type { Opportunity, ScanMeta }
export type ThresholdState = ThresholdParams

export type OpportunitiesResponse = {
  opportunities: Opportunity[]
  meta: ScanMeta
}

export async function fetchOpportunities(params: ThresholdState): Promise<OpportunitiesResponse | null> {
  const query = new URLSearchParams({
    price_threshold: String(params.price_threshold),
    listing_staleness_hours: String(params.listing_staleness_hours),
    days_of_supply: String(params.days_of_supply),
    limit: String(params.limit),
    hq: String(params.hq),
  })
  const res = await fetch(`/api/opportunities?${query}`)
  if (res.status === 202) return null  // cold start — caller shows loading state
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<OpportunitiesResponse>
}
