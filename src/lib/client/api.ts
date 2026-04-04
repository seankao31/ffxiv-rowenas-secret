// src/client/lib/api.ts
import type { Opportunity, ScanMeta, ScanProgress, ThresholdParams } from '../shared/types.ts'

export type { Opportunity, ScanMeta, ScanProgress }
export type ThresholdState = ThresholdParams

export type OpportunitiesResponse = {
  opportunities: Opportunity[]
  meta: ScanMeta
}

export type ColdStartResponse = {
  ready: false
  progress: ScanProgress
}

export async function fetchOpportunities(params: ThresholdState): Promise<OpportunitiesResponse | ColdStartResponse> {
  const query = new URLSearchParams({
    price_threshold: String(params.price_threshold),
    listing_staleness_hours: String(params.listing_staleness_hours),
    days_of_supply: String(params.days_of_supply),
    limit: String(params.limit),
    hq: String(params.hq),
  })
  const res = await fetch(`/api/opportunities?${query}`)
  if (res.status === 202) {
    return await res.json() as ColdStartResponse
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<OpportunitiesResponse>
}
