// src/client/lib/item-names.ts
// Lazy English name resolution for items missing Traditional Chinese names.
// Only fetches from xivapi when an item's name matches the "Item #<id>" fallback pattern.

const FALLBACK_RE = /^Item #(\d+)$/
const cache = new Map<number, string>()
const inflight = new Set<number>()
let onChange: (() => void) | null = null

export function setOnChange(cb: () => void) {
  onChange = cb
}

export function resolveItemName(itemID: number, itemName: string): string {
  if (!FALLBACK_RE.test(itemName)) return itemName
  if (cache.has(itemID)) return cache.get(itemID)!

  if (!inflight.has(itemID)) {
    inflight.add(itemID)
    fetch(`https://xivapi.com/item/${itemID}?columns=Name`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.Name) {
          cache.set(itemID, data.Name)
          onChange?.()
        }
      })
      .catch(() => {})
      .finally(() => inflight.delete(itemID))
  }

  return itemName
}
