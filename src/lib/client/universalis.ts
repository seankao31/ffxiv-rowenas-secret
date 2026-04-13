import type { Listing, Sale } from '$lib/shared/types'
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

type UniversalisHistoryEntry = {
  timestamp: number
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  hq: boolean
  buyerName: string | null
}

type UniversalisHistoryResponse = {
  entries?: UniversalisHistoryEntry[]
}

export async function fetchItemSaleHistory(itemId: number): Promise<Sale[]> {
  const url = `${BASE_URL}/history/${encodeURIComponent(DC_NAME)}/${itemId}?entriesToReturn=200`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching sale history for item ${itemId}`)
  }
  const data = (await res.json()) as UniversalisHistoryResponse
  const sales = (data.entries ?? []).map((e): Sale => ({
    pricePerUnit: e.pricePerUnit,
    quantity: e.quantity,
    worldID: e.worldID,
    worldName: e.worldName,
    timestamp: e.timestamp * 1000,
    hq: e.hq,
    buyerName: e.buyerName ?? null,
  }))
  sales.sort((a, b) => b.timestamp - a.timestamp)
  return sales
}
