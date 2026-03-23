// src/server/scanner.ts
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchWorldListings, fetchItemName, DC_WORLDS } from './universalis.ts'
import { setItem, setItemName, setScanMeta, getScanMeta } from './cache.ts'
import type { ItemData, Listing, SaleRecord } from '../shared/types.ts'

const HOME_WORLD_ID = 4030
const SCAN_COOLDOWN_MS = 60_000

type ScanStrategy = 'dc' | 'per-world'
const SCAN_STRATEGY: ScanStrategy = (process.env['SCAN_STRATEGY'] as ScanStrategy) || 'per-world'

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
  worldUploadTimes: Record<number, number>,  // from DC API response, unix ms
  homeResult: {
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: SaleRecord[]
    lastUploadTime: number
  }
): ItemData {
  // homeLastUploadTime: authoritative from Phase 2; fallback to DC worldUploadTimes for home world
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

function makeProgressLogger(phase: string): (completed: number, total: number) => void {
  const LOG_INTERVAL = 10  // log every N batches
  return (completed: number, total: number) => {
    if (completed === total || completed % LOG_INTERVAL === 0) {
      console.log(`[scanner] ${phase}: ${completed}/${total} batches`)
    }
  }
}

async function runScanCycle(itemIds: number[]): Promise<void> {
  const cycleStart = Date.now()
  console.log(`[scanner] Starting scan of ${itemIds.length} items`)

  // Phase 1: DC-level listings (all worlds)
  console.log('[scanner] Phase 1: DC listings...')
  const p1Start = Date.now()
  const dcResults = await fetchDCListings(itemIds, makeProgressLogger('Phase 1'))
  const p1Elapsed = ((Date.now() - p1Start) / 1000).toFixed(1)
  console.log(`[scanner] Phase 1 done: ${dcResults.length} items in ${p1Elapsed}s`)

  const dcByItemId = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()
  for (const r of dcResults) {
    dcByItemId.set(r.itemID, { listings: r.listings as Listing[], worldUploadTimes: r.worldUploadTimes })
  }

  // Phase 2: Home world (velocity + history)
  console.log('[scanner] Phase 2: home world data...')
  const p2Start = Date.now()
  const homeResults = await fetchHomeListings(itemIds, makeProgressLogger('Phase 2'))
  const p2Elapsed = ((Date.now() - p2Start) / 1000).toFixed(1)
  console.log(`[scanner] Phase 2 done: ${homeResults.length} items in ${p2Elapsed}s`)

  let updated = 0
  for (const home of homeResults) {
    const dc = dcByItemId.get(home.itemID)
    if (!dc) continue

    const itemData = buildItemData(
      home.itemID,
      dc.listings,
      dc.worldUploadTimes,
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

async function runScanCyclePerWorld(itemIds: number[]): Promise<void> {
  const cycleStart = Date.now()
  console.log(`[scanner] Starting per-world scan of ${itemIds.length} items across ${DC_WORLDS.length} worlds`)

  // Phase 1: fetch each world sequentially, merge results
  const mergedListings = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()

  for (const world of DC_WORLDS) {
    const worldStart = Date.now()
    console.log(`[scanner] Phase 1: ${world.name} (${world.id})...`)

    const worldResults = await fetchWorldListings(
      world,
      itemIds,
      makeProgressLogger(`Phase 1 [${world.name}]`),
    )

    for (const r of worldResults) {
      const existing = mergedListings.get(r.itemID)
      if (existing) {
        existing.listings.push(...(r.listings as Listing[]))
        Object.assign(existing.worldUploadTimes, r.worldUploadTimes)
      } else {
        mergedListings.set(r.itemID, {
          listings: r.listings as Listing[],
          worldUploadTimes: { ...r.worldUploadTimes },
        })
      }
    }

    const worldElapsed = ((Date.now() - worldStart) / 1000).toFixed(1)
    console.log(`[scanner] ${world.name} done: ${worldResults.length} items in ${worldElapsed}s`)
  }

  const p1Elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1)
  console.log(`[scanner] Phase 1 done (all worlds): ${mergedListings.size} items in ${p1Elapsed}s`)

  // Phase 2: Home world (velocity + history) — unchanged
  console.log('[scanner] Phase 2: home world data...')
  const p2Start = Date.now()
  const homeResults = await fetchHomeListings(itemIds, makeProgressLogger('Phase 2'))
  const p2Elapsed = ((Date.now() - p2Start) / 1000).toFixed(1)
  console.log(`[scanner] Phase 2 done: ${homeResults.length} items in ${p2Elapsed}s`)

  let updated = 0
  for (const home of homeResults) {
    const dc = mergedListings.get(home.itemID)
    if (!dc) continue

    const itemData = buildItemData(
      home.itemID,
      dc.listings,
      dc.worldUploadTimes,
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
  console.log(`[scanner] Using "${SCAN_STRATEGY}" scan strategy`)

  // Background name hydration — does not block first scan
  hydrateNames(itemIds).catch(err => console.error('[scanner] Name hydration error:', err))

  while (true) {
    try {
      if (SCAN_STRATEGY === 'per-world') {
        await runScanCyclePerWorld(itemIds)
      } else {
        await runScanCycle(itemIds)
      }
    } catch (err) {
      console.error('[scanner] Scan cycle failed:', err)
    }
    await new Promise(r => setTimeout(r, SCAN_COOLDOWN_MS))
  }
}
