// XIVAPI v2 client: batched item metadata (icons + English fallback names)

const XIVAPI_BASE = 'https://v2.xivapi.com/api'
const FALLBACK_RE = /^Item #\d+$/

const cache = new Map<number, { name?: string, iconPath?: string }>()

export function buildIconUrl(path: string): string {
  return `${XIVAPI_BASE}/asset?path=${path}&format=webp`
}

export function isFallbackName(name: string): boolean {
  return FALLBACK_RE.test(name)
}

export function resolveItemName(itemID: number, serverName: string): string {
  if (!isFallbackName(serverName)) return serverName
  return cache.get(itemID)?.name ?? serverName
}

export function getIconUrl(itemID: number): string | undefined {
  const entry = cache.get(itemID)
  return entry?.iconPath ? buildIconUrl(entry.iconPath) : undefined
}

export function getEnglishName(itemID: number): string | undefined {
  return cache.get(itemID)?.name
}

/** @internal — test-only cache seeding */
export function _seedCache(itemID: number, data: { name?: string, iconPath?: string }): void {
  cache.set(itemID, data)
}

/** @internal — test-only cache reset */
export function _clearCache(): void {
  cache.clear()
}

type XivApiItemRow = {
  row_id: number
  fields: {
    Name?: string
    Icon?: { id: number, path: string, path_hr1: string }
  }
}

// Multi-subscriber change signal: each component subscribes independently
// and receives an unsubscribe handle. Previously this was a single-listener
// sink, so two live components (e.g. the table and the buy-route modal)
// would clobber each other's listeners.
const listeners = new Set<() => void>()

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** @internal — test-only listener reset */
export function _clearListeners(): void {
  listeners.clear()
}

export async function fetchItemMetadata(itemIDs: number[]): Promise<void> {
  const uncached = itemIDs.filter(id => !cache.has(id))
  if (uncached.length === 0) return

  try {
    const url = `${XIVAPI_BASE}/sheet/Item?rows=${uncached.join(',')}&fields=Icon,Name`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[xivapi] Failed to fetch item metadata: HTTP ${res.status}`)
      return
    }
    const data = await res.json() as { rows: XivApiItemRow[] }
    for (const row of data.rows) {
      cache.set(row.row_id, {
        name: row.fields.Name,
        iconPath: row.fields.Icon?.path,
      })
    }
    for (const cb of listeners) cb()
  } catch (err) {
    console.warn('[xivapi] Failed to fetch item metadata:', err)
  }
}
