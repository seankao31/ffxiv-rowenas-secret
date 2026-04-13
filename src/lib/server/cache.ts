import type { ItemData, ScanMeta, ScanProgress, CraftCostEntry } from '$lib/shared/types.ts'

const itemCache = new Map<number, ItemData>()
const nameCache = new Map<number, string>()  // itemID → display name
let nameCacheSettled = false  // true once setNameMap has been called (success or failure)
let nameCacheResolve: (() => void) | null = null
let nameCachePromise: Promise<void> | null = null
let vendorPrices = new Map<number, number>()  // itemID → NPC vendor price

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
  if (!nameCacheSettled) {
    nameCacheSettled = true
    if (nameCacheResolve) {
      nameCacheResolve()
      nameCacheResolve = null
      nameCachePromise = null
    }
  }
}

export function waitForNameCache(): Promise<void> {
  if (nameCacheSettled) return Promise.resolve()
  if (!nameCachePromise) {
    nameCachePromise = new Promise<void>(resolve => { nameCacheResolve = resolve })
  }
  return nameCachePromise
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

export function setVendorPrices(prices: Map<number, number>): void {
  vendorPrices.clear()
  for (const [id, price] of prices) {
    vendorPrices.set(id, price)
  }
}

export function getVendorPrices(): Map<number, number> {
  return vendorPrices
}

let craftCostCache = new Map<number, CraftCostEntry>()

export function setCraftCosts(costs: Map<number, CraftCostEntry>): void {
  craftCostCache = costs
}

export function getCraftCosts(): Map<number, CraftCostEntry> {
  return craftCostCache
}

// Test-only: reset name cache loading state so waitForNameCache works fresh between tests
export function _resetNameCacheState(): void {
  nameCacheSettled = false
  nameCacheResolve = null
  nameCachePromise = null
}
