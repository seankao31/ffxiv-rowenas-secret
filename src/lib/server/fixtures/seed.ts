import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setItem, setNameMap, setScanMeta, setCraftCosts } from '$lib/server/cache'
import { solveCraftCostBatch } from '$lib/server/crafting'
import type { ItemData } from '$lib/shared/types'

type Snapshot = {
  items: ItemData[]
  names: Record<string, string>
}

export function seedFixtureData(): void {
  const snapshotPath = join(dirname(fileURLToPath(import.meta.url)), 'snapshot.json')
  const raw = readFileSync(snapshotPath, 'utf-8')
  const snapshot: Snapshot = JSON.parse(raw)

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

  const itemCache = new Map<number, ItemData>()
  for (const item of snapshot.items) {
    itemCache.set(item.itemID, item)
  }
  const craftCosts = solveCraftCostBatch(itemCache, new Map())
  setCraftCosts(craftCosts)

  console.log(`[fixtures] Seeded cache with ${snapshot.items.length} items, ${craftCosts.size} craft costs`)
}
