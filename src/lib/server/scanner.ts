// src/server/scanner.ts
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchWorldListings, fetchHomeWorldCombined, fetchItemNames, DC_WORLDS, HOME_WORLD_ID } from './universalis.ts'
import { setItem, setNameMap, setScanMeta, getScanMeta, setScanProgress } from './cache.ts'
import type { ItemData, Listing, SaleRecord } from '../shared/types.ts'
const SCAN_COOLDOWN_MS = 60_000

type ScanStrategy = 'dc' | 'per-world'
const SCAN_STRATEGY: ScanStrategy = (process.env['SCAN_STRATEGY'] as ScanStrategy) || 'per-world'

export function buildItemData(
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

function makeProgressTracker(
  phase: string,
  baseOffset: number,
  totalBatches: number,
): (completed: number, total: number) => void {
  const LOG_INTERVAL = 10
  return (completed: number, total: number) => {
    if (completed === total || completed % LOG_INTERVAL === 0) {
      console.log(`[scanner] ${phase}: ${completed}/${total} batches`)
    }
    setScanProgress({
      phase,
      completedBatches: baseOffset + completed,
      totalBatches,
    })
  }
}

async function runScanCycle(itemIds: number[]): Promise<void> {
  const cycleStart = Date.now()
  const batchesPerPhase = Math.ceil(itemIds.length / 100)
  const totalBatches = batchesPerPhase * 2  // Phase 1 + Phase 2
  console.log(`[scanner] Starting scan of ${itemIds.length} items`)

  // Phase 1: DC-level listings (all worlds)
  console.log('[scanner] Phase 1: DC listings...')
  const p1Start = Date.now()
  const dcResults = await fetchDCListings(itemIds, makeProgressTracker('Phase 1: DC listings', 0, totalBatches))
  const p1Elapsed = ((Date.now() - p1Start) / 1000).toFixed(1)
  console.log(`[scanner] Phase 1 done: ${dcResults.length} items in ${p1Elapsed}s`)

  const dcByItemId = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()
  for (const r of dcResults) {
    dcByItemId.set(r.itemID, { listings: r.listings as Listing[], worldUploadTimes: r.worldUploadTimes })
  }

  // Phase 2: Home world (velocity + history)
  console.log('[scanner] Phase 2: home world data...')
  const p2Start = Date.now()
  const homeResults = await fetchHomeListings(itemIds, makeProgressTracker('Phase 2: home world', batchesPerPhase, totalBatches))
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
  const batchesPerPhase = Math.ceil(itemIds.length / 100)
  const totalBatches = batchesPerPhase * DC_WORLDS.length  // 8 worlds (home included, no separate Phase 2)
  setScanProgress({ phase: DC_WORLDS[0]!.name, completedBatches: 0, totalBatches })
  console.log(`[scanner] Starting per-world scan of ${itemIds.length} items across ${DC_WORLDS.length} worlds`)

  const mergedListings = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()
  // Home world velocity/history extracted during 利維坦's pass — keyed by itemID
  const homeByItemId = new Map<number, {
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: SaleRecord[]
    lastUploadTime: number
  }>()

  for (let wi = 0; wi < DC_WORLDS.length; wi++) {
    const world = DC_WORLDS[wi]!
    const isHome = world.id === HOME_WORLD_ID
    const worldStart = Date.now()
    console.log(`[scanner] ${world.name} (${world.id})${isHome ? ' [home — combined fetch]' : ''}...`)

    let worldResults: Awaited<ReturnType<typeof fetchWorldListings>>

    if (isHome) {
      const combined = await fetchHomeWorldCombined(
        itemIds,
        makeProgressTracker(world.name, wi * batchesPerPhase, totalBatches),
      )
      worldResults = combined.dcResults
      for (const h of combined.homeResults) {
        homeByItemId.set(h.itemID, {
          regularSaleVelocity: h.regularSaleVelocity,
          hqSaleVelocity: h.hqSaleVelocity,
          recentHistory: h.recentHistory as SaleRecord[],
          lastUploadTime: h.lastUploadTime,
        })
      }
    } else {
      worldResults = await fetchWorldListings(
        world,
        itemIds,
        makeProgressTracker(world.name, wi * batchesPerPhase, totalBatches),
      )
    }

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

  const scanElapsed = ((Date.now() - cycleStart) / 1000).toFixed(1)
  console.log(`[scanner] All worlds done: ${mergedListings.size} items in ${scanElapsed}s`)

  let updated = 0
  for (const [itemID, dc] of mergedListings) {
    const home = homeByItemId.get(itemID)
    const itemData = buildItemData(
      itemID,
      dc.listings,
      dc.worldUploadTimes,
      {
        regularSaleVelocity: home?.regularSaleVelocity ?? 0,
        hqSaleVelocity: home?.hqSaleVelocity ?? 0,
        recentHistory: home?.recentHistory ?? [],
        lastUploadTime: home?.lastUploadTime ?? 0,
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
    setScanProgress({ phase: 'Fetching item list…', completedBatches: 0, totalBatches: 0 })
    console.log('[scanner] Fetching marketable item list...')
    itemIds = await fetchMarketableItems()
    if (itemIds.length === 0) {
      console.warn('[scanner] Failed to fetch item list, retrying in 30s')
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
  console.log(`[scanner] Found ${itemIds.length} marketable items`)
  console.log(`[scanner] Using "${SCAN_STRATEGY}" scan strategy`)

  // Fetch all item names from FFXIV_Market's TW msgpack data
  setScanProgress({ phase: 'Loading item names…', completedBatches: 0, totalBatches: 0 })
  const names = await fetchItemNames()
  if (names.size > 0) setNameMap(names)

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
