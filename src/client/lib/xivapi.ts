// XIVAPI v2 client: batched item metadata (icons + English fallback names)

const XIVAPI_BASE = 'https://v2.xivapi.com/api'
const FALLBACK_RE = /^Item #\d+$/

const cache = new Map<number, { name?: string, iconPath?: string }>()

export function buildIconUrl(path: string): string {
  return `${XIVAPI_BASE}/asset?path=${path}&format=webp`
}

export function resolveItemName(itemID: number, serverName: string): string {
  if (!FALLBACK_RE.test(serverName)) return serverName
  return cache.get(itemID)?.name ?? serverName
}

export function getIconUrl(itemID: number): string | undefined {
  const entry = cache.get(itemID)
  return entry?.iconPath ? buildIconUrl(entry.iconPath) : undefined
}

/** @internal — test-only cache seeding */
export function _seedCache(itemID: number, data: { name?: string, iconPath?: string }): void {
  cache.set(itemID, data)
}

/** @internal — test-only cache reset */
export function _clearCache(): void {
  cache.clear()
}
