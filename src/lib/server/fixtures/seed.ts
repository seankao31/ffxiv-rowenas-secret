import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setItem, setNameMap, setScanMeta, setCraftCosts, getAllItems } from '$lib/server/cache'
import { solveCraftCostBatch } from '$lib/server/crafting'
import type { ItemData } from '$lib/shared/types'

type Snapshot = {
  items: ItemData[]
  names: Record<string, string>
}

/**
 * Shift all timestamps forward so the newest one aligns with Date.now().
 * Rebase to the max timestamp (not a fixed "now") so relative freshness
 * differences between items are preserved — confidence scoring relies on this.
 */
function rebaseTimestamps(items: ItemData[]): void {
  // Find the maximum timestamp (in ms) across all items
  let maxMs = 0
  for (const item of items) {
    for (const ts of Object.values(item.worldUploadTimes)) {
      if (ts > maxMs) maxMs = ts
    }
    if (item.homeLastUploadTime > maxMs) maxMs = item.homeLastUploadTime
    for (const listing of item.listings) {
      if (listing.lastReviewTime > maxMs) maxMs = listing.lastReviewTime
    }
    // recentHistory timestamps are in seconds — convert to ms for comparison
    for (const sale of item.recentHistory) {
      const tsMs = sale.timestamp * 1000
      if (tsMs > maxMs) maxMs = tsMs
    }
  }

  if (maxMs === 0) return

  const offsetMs = Date.now() - maxMs
  const offsetSec = Math.floor(offsetMs / 1000)

  for (const item of items) {
    for (const worldId of Object.keys(item.worldUploadTimes)) {
      if (item.worldUploadTimes[Number(worldId)] !== 0) {
        item.worldUploadTimes[Number(worldId)] += offsetMs
      }
    }
    if (item.homeLastUploadTime > 0) {
      item.homeLastUploadTime += offsetMs
    }
    for (const listing of item.listings) {
      listing.lastReviewTime += offsetMs
    }
    for (const sale of item.recentHistory) {
      sale.timestamp += offsetSec
    }
  }
}

export function seedFixtureData(): void {
  const snapshotPath = join(dirname(fileURLToPath(import.meta.url)), 'snapshot.json')
  const raw = readFileSync(snapshotPath, 'utf-8')
  const snapshot: Snapshot = JSON.parse(raw)

  rebaseTimestamps(snapshot.items)

  for (const item of snapshot.items) {
    setItem(item)
  }

  const nameMap = new Map<number, string>()
  for (const [id, name] of Object.entries(snapshot.names)) {
    nameMap.set(Number(id), name)
  }
  setNameMap(nameMap)

  setScanMeta({
    scanCompletedAt: Date.now(),
    itemsScanned: snapshot.items.length,
    itemsWithOpportunities: 0,
    nextScanEstimatedAt: 0,
  })

  const craftCosts = solveCraftCostBatch(getAllItems(), new Map() /* no vendor prices in fixture snapshot */)
  setCraftCosts(craftCosts)

  console.log(`[fixtures] Seeded cache with ${snapshot.items.length} items, ${craftCosts.size} craft costs`)
}
