// Fetches NPC vendor metadata (names + zones) from Garland Tools.
// CORS: Garland Tools returns access-control-allow-origin: * — no proxy needed.
// Only called for items with sourceWorld === 'NPC' in the current opportunity list.

const GARLAND_BASE = 'https://garlandtools.org'
const ITEM_API = `${GARLAND_BASE}/api/get.php`
const DATA_API = `${GARLAND_BASE}/db/doc/core/en/3/data.json`

export type VendorInfo = {
  npcName: string
  zone: string
}

type GarlandPartial = {
  type: string
  id: string
  obj: { n: string; l?: number }
}

type GarlandItemResponse = {
  item: { id: number; vendors?: number[] }
  partials?: GarlandPartial[]
}

// Cache: itemID → vendor info list
const cache = new Map<number, VendorInfo[]>()

let onChange: (() => void) | null = null

export function setOnChange(cb: (() => void) | null): void {
  onChange = cb
}

// Location index: locationID → zone name (loaded lazily from data.json)
let locationPromise: Promise<Map<number, string>> | null = null

function loadLocationIndex(): Promise<Map<number, string>> {
  if (locationPromise) return locationPromise

  locationPromise = (async () => {
    try {
      const res = await fetch(DATA_API)
      if (!res.ok) {
        console.warn(`[vendors] Failed to fetch location index: HTTP ${res.status}`)
        return new Map<number, string>()
      }

      const data = await res.json() as { locationIndex?: Record<string, { name: string }> }
      const index = new Map<number, string>()
      if (!data.locationIndex) return index
      for (const [id, loc] of Object.entries(data.locationIndex)) {
        index.set(Number(id), loc.name)
      }
      return index
    } catch (err) {
      console.warn('[vendors] Failed to fetch location index:', err)
      locationPromise = null  // allow retry on failure
      return new Map<number, string>()
    }
  })()

  return locationPromise
}

function zoneName(locationId: number | undefined, locations: Map<number, string>): string {
  if (locationId === undefined) return 'Unknown'
  return locations.get(locationId) ?? `Zone ${locationId}`
}

export function getVendorInfo(itemId: number): VendorInfo[] | undefined {
  return cache.get(itemId)
}

/** @internal — test-only cache reset */
export function _clearCache(): void {
  cache.clear()
  locationPromise = null
}

export async function fetchVendorInfo(itemId: number): Promise<void> {
  if (cache.has(itemId)) return

  try {
    const [itemRes, locations] = await Promise.all([
      fetch(`${ITEM_API}?type=item&lang=en&version=3&id=${itemId}`),
      loadLocationIndex(),
    ])

    if (!itemRes.ok) {
      console.warn(`[vendors] Failed to fetch vendor info for item ${itemId}: HTTP ${itemRes.status}`)
      return
    }

    const data = (await itemRes.json()) as GarlandItemResponse
    const vendorIds = new Set((data.item.vendors ?? []).map(String))
    const vendors: VendorInfo[] = []

    for (const partial of data.partials ?? []) {
      if (partial.type === 'npc' && vendorIds.has(partial.id)) {
        vendors.push({
          npcName: partial.obj.n,
          zone: zoneName(partial.obj.l, locations),
        })
      }
    }

    cache.set(itemId, vendors)
    onChange?.()
  } catch (err) {
    console.warn(`[vendors] Failed to fetch vendor info for item ${itemId}:`, err)
  }
}
