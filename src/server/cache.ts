// src/server/cache.ts
import type { ItemData, ScanMeta, ScanProgress } from '../shared/types.ts'

const itemCache = new Map<number, ItemData>()
const nameCache = new Map<number, string>()  // itemID → display name

let scanMeta: ScanMeta = {
  scanCompletedAt: 0,
  itemsScanned: 0,
  itemsWithOpportunities: 0,
  nextScanEstimatedAt: 0,
}

export function setItem(data: ItemData): void {
  itemCache.set(data.itemID, data)
}

export function getAllItems(): Map<number, ItemData> {
  return itemCache
}

export function setNameMap(names: Map<number, string>): void {
  nameCache.clear()
  for (const [id, name] of names) {
    nameCache.set(id, name)
  }
}

export function getNameMap(): Map<number, string> {
  return nameCache
}

export function isCacheReady(): boolean {
  return scanMeta.scanCompletedAt > 0
}

export function setScanMeta(meta: ScanMeta): void {
  scanMeta = meta
}

export function getScanMeta(): ScanMeta {
  return scanMeta
}

let scanProgress: ScanProgress = { phase: '', completedBatches: 0, totalBatches: 0 }

export function setScanProgress(progress: ScanProgress): void {
  scanProgress = progress
}

export function getScanProgress(): ScanProgress {
  return scanProgress
}
