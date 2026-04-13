import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setItem, setNameMap, setScanMeta } from '$lib/server/cache'
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

  console.log(`[fixtures] Seeded cache with ${snapshot.items.length} items`)
}
