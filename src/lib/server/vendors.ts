const XIVAPI_BASE = 'https://v2.xivapi.com/api'
const PAGE_SIZE = 500
const BATCH_SIZE = 500
const BATCH_MAX_RETRIES = 3

// Items in GilShopItem with PriceMid > 0 that are not actually vendor-purchasable.
// Verified 2026-04-08 against Garland Tools (see docs/investigations/2026-04-08-vendor-price-verification.md).
const FALSE_POSITIVE_ITEM_IDS: ReadonlySet<number> = new Set([
  // Stat Hi-Potions — in GilShopItem but no NPC sells them
  4599, 4600, 4601, 4602, 4603,
  // Crafted gear erroneously in a GilShop definition
  13266,
  // Housing permits — purchased via housing UI, not a standard NPC shop
  6320, 6321, 6322, 6323, 6324, 6325, 6326, 6327, 6328,
  6329, 6330, 6331, 6332, 6333, 6334, 6335, 6336, 6337,
  6338, 6339, 6340, 6341, 6342,
  35608, 35609, 35610, 35611, 35612, 35613, 35614, 35615, 35616,
])

type GilShopItemRow = {
  row_id: number
  subrow_id?: number
  fields: {
    Item?: { row_id: number }
  }
}

type SheetResponse = {
  rows: GilShopItemRow[]
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
    if (data.rows.length === 0) break

    for (const row of data.rows) {
      const itemId = row.fields.Item?.row_id
      if (itemId && itemId > 0 && !FALSE_POSITIVE_ITEM_IDS.has(itemId)) itemIds.add(itemId)
    }

    // SheetResponse has no `next` cursor — construct from last row's row_id:subrow_id
    const last = data.rows.at(-1)!
    cursor = last.subrow_id != null ? `${last.row_id}:${last.subrow_id}` : `${last.row_id}`
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
