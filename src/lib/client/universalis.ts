import type { Listing } from '$lib/shared/types'
import { BASE_URL, DC_NAME } from '$lib/shared/universalis'

type UniversalisListing = {
  lastReviewTime: number
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  hq: boolean
}

type UniversalisResponse = {
  listings?: UniversalisListing[]
}

export async function fetchItemListings(itemId: number): Promise<Listing[]> {
  const url = `${BASE_URL}/${encodeURIComponent(DC_NAME)}/${itemId}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching listings for item ${itemId}`)
  }
  const data = (await res.json()) as UniversalisResponse
  const listings = (data.listings ?? []).map((l): Listing => ({
    pricePerUnit: l.pricePerUnit,
    quantity: l.quantity,
    worldID: l.worldID,
    worldName: l.worldName,
    lastReviewTime: l.lastReviewTime * 1000,
    hq: l.hq,
  }))
  listings.sort((a, b) => a.pricePerUnit - b.pricePerUnit)
  return listings
}
