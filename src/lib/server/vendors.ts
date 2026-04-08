const XIVAPI_BASE = 'https://v2.xivapi.com/api'
const PAGE_SIZE = 500
const BATCH_SIZE = 500
const BATCH_MAX_RETRIES = 3

type GilShopItemRow = {
  row_id: number
  fields: {
    Item?: { row_id: number }
  }
}

type SheetResponse = {
  rows: GilShopItemRow[]
  next?: string
}

type ItemPriceRow = {
  row_id: number
  fields: {
    PriceMid?: number
  }
}

import { chunk } from './universalis'

async function fetchVendorItemIds(): Promise<Set<number>> {
  const itemIds = new Set<number>()
  let cursor: string | undefined

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      fields: 'Item',
    })
    if (cursor) params.set('after', cursor)

    const res = await fetch(`${XIVAPI_BASE}/sheet/GilShopItem?${params}`)
    if (!res.ok) {
      console.warn(`[vendors] GilShopItem fetch failed: HTTP ${res.status}`)
      break
    }

    const data = (await res.json()) as SheetResponse
    for (const row of data.rows) {
      const itemId = row.fields.Item?.row_id
      if (itemId && itemId > 0) itemIds.add(itemId)
    }

    if (!data.next) break
    cursor = data.next
  }

  return itemIds
}

async function fetchItemPrices(itemIds: number[]): Promise<Map<number, number>> {
  const prices = new Map<number, number>()
  const batches = chunk(itemIds, BATCH_SIZE)

  for (const batch of batches) {
    let lastStatus = 0
    let success = false

    for (let attempt = 0; attempt < BATCH_MAX_RETRIES; attempt++) {
      const res = await fetch(`${XIVAPI_BASE}/sheet/Item?rows=${batch.join(',')}&fields=PriceMid`)
      if (!res.ok) {
        lastStatus = res.status
        console.warn(`[vendors] Item price batch failed (attempt ${attempt + 1}/${BATCH_MAX_RETRIES}): HTTP ${res.status}`)
        continue
      }

      const data = (await res.json()) as { rows: ItemPriceRow[] }
      for (const row of data.rows) {
        const price = row.fields.PriceMid
        if (price && price > 0) {
          prices.set(row.row_id, price)
        }
      }
      success = true
      break
    }

    if (!success) {
      throw new Error(`[vendors] Item price batch failed after ${BATCH_MAX_RETRIES} retries: HTTP ${lastStatus}`)
    }
  }

  return prices
}

export async function fetchVendorPrices(): Promise<Map<number, number>> {
  console.log('[vendors] Fetching vendor item IDs from XIVAPI...')
  const vendorItemIds = await fetchVendorItemIds()
  if (vendorItemIds.size === 0) {
    console.warn('[vendors] No vendor items found')
    return new Map()
  }
  console.log(`[vendors] Found ${vendorItemIds.size} vendor items, fetching prices...`)

  const prices = await fetchItemPrices([...vendorItemIds])
  console.log(`[vendors] Loaded ${prices.size} vendor prices`)
  return prices
}
