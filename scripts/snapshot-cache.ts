/**
 * Captures a snapshot of real Universalis market data for use with FIXTURE_DATA mode.
 *
 * Usage: bun run scripts/snapshot-cache.ts
 *
 * Runs a single scan cycle against the Universalis API, picks a representative
 * subset of items (~40), and writes them to src/lib/server/fixtures/snapshot.json.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchItemNames } from '../src/lib/server/universalis'
import { buildItemData } from '../src/lib/server/scanner'
import type { ItemData, Listing, SaleRecord } from '../src/lib/shared/types'

const TARGET_ITEMS = 40

async function main() {
  console.log('[snapshot] Fetching marketable item list...')
  const allItemIds = await fetchMarketableItems()
  if (allItemIds.length === 0) {
    console.error('[snapshot] Failed to fetch item list')
    process.exit(1)
  }
  console.log(`[snapshot] Found ${allItemIds.length} marketable items`)

  console.log('[snapshot] Loading item names...')
  const names = await fetchItemNames()

  // Take a random sample to get diverse items
  const shuffled = allItemIds.slice().sort(() => Math.random() - 0.5)
  const sampleIds = shuffled.slice(0, TARGET_ITEMS)
  console.log(`[snapshot] Scanning ${sampleIds.length} items...`)

  // Phase 1: DC listings
  const dcResults = await fetchDCListings(sampleIds, (done, total) => {
    if (done === total) console.log(`[snapshot] Phase 1 done: ${done}/${total} batches`)
  })
  const dcByItemId = new Map<number, { listings: Listing[], worldUploadTimes: Record<number, number> }>()
  for (const r of dcResults) {
    dcByItemId.set(r.itemID, { listings: r.listings as Listing[], worldUploadTimes: r.worldUploadTimes })
  }

  // Phase 2: Home world velocity + history
  const homeResults = await fetchHomeListings(sampleIds, (done, total) => {
    if (done === total) console.log(`[snapshot] Phase 2 done: ${done}/${total} batches`)
  })

  const items: ItemData[] = []
  const nameEntries: Record<string, string> = {}

  for (const home of homeResults) {
    const dc = dcByItemId.get(home.itemID)
    if (!dc) continue

    const itemData = buildItemData(
      home.itemID,
      dc.listings,
      dc.worldUploadTimes,
      {
        regularSaleVelocity: home.regularSaleVelocity,
        hqSaleVelocity: home.hqSaleVelocity,
        recentHistory: home.recentHistory as SaleRecord[],
        lastUploadTime: home.lastUploadTime,
      }
    )
    items.push(itemData)

    const name = names.get(home.itemID)
    if (name) nameEntries[String(home.itemID)] = name
  }

  const snapshot = { items, names: nameEntries }
  const outPath = join(import.meta.dir, '..', 'src', 'lib', 'server', 'fixtures', 'snapshot.json')
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`[snapshot] Wrote ${items.length} items to ${outPath}`)
}

main().catch(err => {
  console.error('[snapshot] Fatal:', err)
  process.exit(1)
})
