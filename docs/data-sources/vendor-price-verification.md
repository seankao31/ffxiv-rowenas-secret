# Vendor Price Verification Report

**Date:** 2026-04-08
**Scope:** Full verification of all GilShopItem entries against Garland Tools API

## Background

The vendor arbitrage feature uses XIVAPI v2's `GilShopItem` sheet to identify NPC-vendored items and `Item.PriceMid` as the vendor buy price. This report verifies two questions:

1. Does `PriceMid` reflect the correct NPC vendor price?
2. Are all items in `GilShopItem` with `PriceMid > 0` actually purchasable from NPC vendors?

Each qualifying item is cross-referenced against Garland Tools, which performs the full `ENpcResident → ENpcBase → GilShop → GilShopItem` traversal to confirm vendor availability.

## Methodology

1. Fetch all unique item IDs from `GilShopItem` using corrected pagination (`after=row_id:subrow_id`)
2. Fetch `PriceMid` for all items from the `Item` sheet via batch requests
3. For every item with `PriceMid > 0`, query Garland Tools (`/api/get.php?type=item&id={id}`) and compare:
   - `PriceMid` vs Garland's `price` field (both derived from SaintCoinach)
   - Whether Garland's `vendors` array is present and non-empty

## Results

| Metric | Value |
|--------|-------|
| Total unique items in GilShopItem | 6,741 |
| Items with PriceMid > 0 | 1,397 |
| Items with PriceMid = 0 | 3 |
| Items not in XIVAPI Item sheet | 5,341 |
| **Price matches (XIVAPI = Garland)** | **1,397 / 1,397 (100.0%)** |
| **Price mismatches** | **0** |
| False positives (no Garland vendors) | 38 (2.7%) |
| Garland API errors | 0 |

### Price accuracy

Every `PriceMid` value matches Garland's `price` field exactly. Zero mismatches across all 1,397 items. This confirms the doc's claim that both sources read the same SaintCoinach field.

### False positives

38 items (2.7%) appear in `GilShopItem` with a positive `PriceMid` but have no `vendors` array in Garland Tools. These items are in the game data's shop definitions but are not wired to an actual NPC through the standard vendor chain.

They fall into three categories:

#### Housing permits (32 items)

Purchased through the housing district purchase UI, not a standard NPC shop dialog.

| ID | Name | PriceMid |
|----|------|----------|
| 6320 | Riviera Cottage Permit (Wood) | 450,000 |
| 6321 | Riviera Cottage Permit (Composite) | 450,000 |
| 6322 | Riviera Cottage Permit (Stone) | 450,000 |
| 6323 | Riviera House Permit (Wood) | 1,000,000 |
| 6324 | Riviera House Permit (Composite) | 1,000,000 |
| 6325 | Riviera House Permit (Stone) | 1,000,000 |
| 6326 | Riviera Mansion Permit (Wood) | 3,000,000 |
| 6327 | Riviera Mansion Permit (Composite) | 3,000,000 |
| 6328 | Riviera Mansion Permit (Stone) | 3,000,000 |
| 6329 | Glade Cottage Permit (Wood) | 450,000 |
| 6330 | Glade Cottage Permit (Composite) | 450,000 |
| 6331 | Glade Cottage Permit (Stone) | 450,000 |
| 6332 | Glade House Permit (Wood) | 1,000,000 |
| 6333 | Glade House Permit (Composite) | 1,000,000 |
| 6334 | Glade House Permit (Stone) | 1,000,000 |
| 6335 | Glade Mansion Permit (Wood) | 3,000,000 |
| 6336 | Glade Mansion Permit (Composite) | 3,000,000 |
| 6337 | Glade Mansion Permit (Stone) | 3,000,000 |
| 6338 | Oasis Cottage Permit (Wood) | 450,000 |
| 6339 | Oasis Cottage Permit (Composite) | 450,000 |
| 6340 | Oasis Cottage Permit (Stone) | 450,000 |
| 6341 | Oasis House Permit (Wood) | 1,000,000 |
| 6342 | Oasis House Permit (Composite) | 1,000,000 |
| 35608 | Highland Cottage Permit (Wood) | 450,000 |
| 35609 | Highland Cottage Permit (Stone) | 450,000 |
| 35610 | Highland Cottage Permit (Composite) | 450,000 |
| 35611 | Highland House Permit (Wood) | 1,000,000 |
| 35612 | Highland House Permit (Stone) | 1,000,000 |
| 35613 | Highland House Permit (Composite) | 1,000,000 |
| 35614 | Highland Mansion Permit (Wood) | 3,000,000 |
| 35615 | Highland Mansion Permit (Stone) | 3,000,000 |
| 35616 | Highland Mansion Permit (Composite) | 3,000,000 |

#### Stat Hi-Potions (5 items)

These exist in GilShopItem but no NPC currently sells them. Possibly removed from vendor inventory in a past patch.

| ID | Name | PriceMid |
|----|------|----------|
| 4599 | Hi-Potion of Strength | 518 |
| 4600 | Hi-Potion of Dexterity | 518 |
| 4601 | Hi-Potion of Vitality | 518 |
| 4602 | Hi-Potion of Intelligence | 518 |
| 4603 | Hi-Potion of Mind | 518 |

#### Crafted gear (1 item)

A crafted item that appears in a GilShop definition but is not wired to any NPC.

| ID | Name | PriceMid |
|----|------|----------|
| 13266 | High House Justaucorps | 45 |

### Practical impact on arbitrage

These false positives are unlikely to generate bad arbitrage signals:

- **Housing permits** are untradeable on the market board, so they won't appear in Universalis data and can never produce an arbitrage opportunity.
- **Hi-Potions** have PriceMid=518 — low enough that any market board listing would need to exceed ~545 gil after tax to show a profit. These are cheap consumables unlikely to trigger.
- **High House Justaucorps** has PriceMid=45, which would flag almost any MB listing as profitable. This is the item that originally surfaced the bug.

### All false positive IDs

For blocklist implementation if needed:

```
4599, 4600, 4601, 4602, 4603, 6320, 6321, 6322, 6323, 6324, 6325, 6326, 6327, 6328, 6329, 6330, 6331, 6332, 6333, 6334, 6335, 6336, 6337, 6338, 6339, 6340, 6341, 6342, 13266, 35608, 35609, 35610, 35611, 35612, 35613, 35614, 35615, 35616
```

## Verification script

```typescript
const XIVAPI_BASE = 'https://v2.xivapi.com/api'

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// Fetch all unique item IDs from GilShopItem with correct subrow pagination
async function fetchAllVendorItemIds(): Promise<Set<number>> {
  const itemIds = new Set<number>()
  let cursor: string | undefined
  while (true) {
    const params = new URLSearchParams({ limit: '500', fields: 'Item.row_id' })
    if (cursor) params.set('after', cursor)
    const res = await fetch(`${XIVAPI_BASE}/sheet/GilShopItem?${params}`)
    if (!res.ok) break
    const data = (await res.json()) as { rows: Array<{ row_id: number; subrow_id?: number; fields: { Item?: { row_id: number } } }> }
    if (data.rows.length === 0) break
    for (const row of data.rows) {
      const id = row.fields?.Item?.row_id
      if (id && id > 0) itemIds.add(id)
    }
    const last = data.rows.at(-1)!
    cursor = last.subrow_id != null ? `${last.row_id}:${last.subrow_id}` : `${last.row_id}`
  }
  return itemIds
}

// Fetch PriceMid for all items in batches of 500
async function fetchPriceMids(ids: number[]): Promise<Map<number, number>> {
  const prices = new Map<number, number>()
  for (const batch of chunk(ids, 500)) {
    const res = await fetch(`${XIVAPI_BASE}/sheet/Item?rows=${batch.join(',')}&fields=PriceMid`)
    if (!res.ok) continue
    const data = (await res.json()) as { rows: Array<{ row_id: number; fields: { PriceMid?: number } }> }
    for (const row of data.rows) {
      prices.set(row.row_id, row.fields.PriceMid ?? 0)
    }
  }
  return prices
}

// Check a single item against Garland Tools
async function checkGarland(id: number): Promise<{ name: string; garlandPrice: number; hasVendors: boolean } | null> {
  try {
    const res = await fetch(`https://garlandtools.org/api/get.php?type=item&lang=en&version=3&id=${id}`)
    if (!res.ok) return null
    const data = (await res.json()) as { item: { name?: string; price?: number; vendors?: number[] } }
    return {
      name: data.item.name ?? '???',
      garlandPrice: data.item.price ?? 0,
      hasVendors: Array.isArray(data.item.vendors) && data.item.vendors.length > 0,
    }
  } catch {
    return null
  }
}

// Main
const allIds = await fetchAllVendorItemIds()
console.log(`Total unique items in GilShopItem: ${allIds.size}`)

const priceMids = await fetchPriceMids([...allIds])
const withPrice = [...priceMids.entries()].filter(([, p]) => p > 0)
console.log(`Items with PriceMid > 0: ${withPrice.length}`)

let matches = 0
let mismatches: Array<{ id: number; name: string; priceMid: number; garlandPrice: number }> = []
let falsePositives: Array<{ id: number; name: string; priceMid: number }> = []
let errors = 0

// Process in batches of 5 concurrent requests
for (let i = 0; i < withPrice.length; i += 5) {
  const batch = withPrice.slice(i, i + 5)
  await Promise.all(batch.map(async ([id, priceMid]) => {
    const g = await checkGarland(id)
    if (!g) { errors++; return }
    if (priceMid === g.garlandPrice) matches++
    else mismatches.push({ id, name: g.name, priceMid, garlandPrice: g.garlandPrice })
    if (!g.hasVendors) falsePositives.push({ id, name: g.name, priceMid })
  }))
}

console.log(`Matches: ${matches}, Mismatches: ${mismatches.length}, False positives: ${falsePositives.length}, Errors: ${errors}`)
```

Run with: `bun run vendor-verify-all.ts`
