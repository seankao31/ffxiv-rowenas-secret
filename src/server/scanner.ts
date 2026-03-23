// src/server/scanner.ts
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchItemName } from './universalis.ts'
import { setItem, setItemName, setScanMeta, getScanMeta } from './cache.ts'
import type { ItemData, Listing, SaleRecord } from '../shared/types.ts'

const HOME_WORLD_ID = 4030
const SCAN_COOLDOWN_MS = 60_000

async function hydrateNames(itemIds: number[]): Promise<void> {
  for (const id of itemIds) {
    try {
      const name = await fetchItemName(id)
      if (name) setItemName(id, name)
    } catch {
      // non-fatal — name resolution is best-effort
    }
    await new Promise(r => setTimeout(r, 50))  // ~20 names/s
  }
}

function buildItemData(
  itemID: number,
  dcListings: Listing[],
  homeResult: {
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: SaleRecord[]
    lastUploadTime: number
  }
): ItemData {
  // Derive worldUploadTimes: max(lastReviewTime) per worldID across all DC listings
  const worldUploadTimes: Record<number, number> = {}
  for (const listing of dcListings) {
    const current = worldUploadTimes[listing.worldID] ?? 0
    if (listing.lastReviewTime > current) {
      worldUploadTimes[listing.worldID] = listing.lastReviewTime
    }
  }

  // homeLastUploadTime: authoritative from Phase 2; fallback for sold-out home boards
  const homeLastUploadTime = homeResult.lastUploadTime > 0
    ? homeResult.lastUploadTime
    : (worldUploadTimes[HOME_WORLD_ID] ?? 0)

  return {
    itemID,
    worldUploadTimes,
    homeLastUploadTime,
    listings: dcListings,
    regularSaleVelocity: homeResult.regularSaleVelocity,
    hqSaleVelocity: homeResult.hqSaleVelocity,
    recentHistory: homeResult.recentHistory,
  }
}

async function runScanCycle(itemIds: number[]): Promise<void> {
  const cycleStart = Date.now()
  console.log(`[scanner] Starting scan of ${itemIds.length} items`)

  // Phase 1: DC-level listings (all worlds)
  console.log('[scanner] Phase 1: DC listings...')
  const dcResults = await fetchDCListings(itemIds)

  const dcByItemId = new Map<number, { listings: Listing[] }>()
  for (const r of dcResults) {
    dcByItemId.set(r.itemID, { listings: r.listings as Listing[] })
  }

  // Phase 2: Home world (velocity + history)
  console.log('[scanner] Phase 2: home world data...')
  const homeResults = await fetchHomeListings(itemIds)

  let updated = 0
  for (const home of homeResults) {
    const dc = dcByItemId.get(home.itemID)
    if (!dc) continue

    const itemData = buildItemData(
      home.itemID,
      dc.listings,
      {
        regularSaleVelocity: home.regularSaleVelocity,
        hqSaleVelocity: home.hqSaleVelocity,
        recentHistory: home.recentHistory as SaleRecord[],
        lastUploadTime: home.lastUploadTime,
      }
    )
    setItem(itemData)
    updated++
  }

  const now = Date.now()
  setScanMeta({
    scanCompletedAt: now,
    itemsScanned: updated,
    itemsWithOpportunities: getScanMeta().itemsWithOpportunities,
    nextScanEstimatedAt: now + SCAN_COOLDOWN_MS,
  })

  const elapsed = ((now - cycleStart) / 1000).toFixed(1)
  console.log(`[scanner] Scan complete: ${updated} items in ${elapsed}s`)
}

export async function startScanner(): Promise<void> {
  let itemIds: number[] = []
  while (itemIds.length === 0) {
    console.log('[scanner] Fetching marketable item list...')
    itemIds = await fetchMarketableItems()
    if (itemIds.length === 0) {
      console.warn('[scanner] Failed to fetch item list, retrying in 30s')
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
  console.log(`[scanner] Found ${itemIds.length} marketable items`)

  // Background name hydration — does not block first scan
  hydrateNames(itemIds).catch(err => console.error('[scanner] Name hydration error:', err))

  while (true) {
    try {
      await runScanCycle(itemIds)
    } catch (err) {
      console.error('[scanner] Scan cycle failed:', err)
    }
    await new Promise(r => setTimeout(r, SCAN_COOLDOWN_MS))
  }
}
