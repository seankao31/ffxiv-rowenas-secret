// scripts/benchmark-scan.ts
// Usage: bun scripts/benchmark-scan.ts [--items N]
//
// Runs a single scan cycle against the live Universalis API and reports
// detailed timing for each phase. Use --items N to limit the number of
// items scanned (useful for quick sanity checks).

import { fetchMarketableItems, fetchDCListings, fetchHomeListings } from '../src/server/universalis.ts'

const BATCH_SIZE = 100

function parseArgs(): { maxItems?: number } {
  const idx = process.argv.indexOf('--items')
  if (idx !== -1 && process.argv[idx + 1]) {
    return { maxItems: parseInt(process.argv[idx + 1], 10) }
  }
  return {}
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

async function main() {
  const { maxItems } = parseArgs()

  // Phase 0: Fetch marketable item list
  console.log('--- Phase 0: Fetching marketable item list ---')
  const p0Start = performance.now()
  let itemIds = await fetchMarketableItems()
  const p0Time = performance.now() - p0Start

  if (itemIds.length === 0) {
    console.error('Failed to fetch marketable items. Aborting.')
    process.exit(1)
  }
  console.log(`  Items: ${itemIds.length}  Time: ${fmt(p0Time)}`)

  if (maxItems && maxItems < itemIds.length) {
    console.log(`  Limiting to first ${maxItems} items`)
    itemIds = itemIds.slice(0, maxItems)
  }

  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)
  console.log(`  Batches per phase: ${totalBatches}`)
  console.log()

  // Phase 1: DC listings
  console.log('--- Phase 1: DC listings (all worlds) ---')
  let p1Completed = 0
  const p1Start = performance.now()
  const dcResults = await fetchDCListings(itemIds, (done, total) => {
    p1Completed = done
    if (done === total || done % 10 === 0) {
      const elapsed = performance.now() - p1Start
      const rate = done / (elapsed / 1000)
      process.stdout.write(`\r  ${done}/${total} batches  (${rate.toFixed(1)} batch/s)`)
    }
  })
  const p1Time = performance.now() - p1Start
  console.log()  // newline after \r progress
  const dcItemCount = dcResults.length
  const dcListingCount = dcResults.reduce((sum, r) => sum + r.listings.length, 0)
  console.log(`  Items returned: ${dcItemCount}`)
  console.log(`  Total listings: ${dcListingCount}`)
  console.log(`  Time: ${fmt(p1Time)}  (${(p1Completed / (p1Time / 1000)).toFixed(1)} batch/s, ${(dcItemCount / (p1Time / 1000)).toFixed(0)} items/s)`)
  console.log()

  // Phase 2: Home world listings
  console.log('--- Phase 2: Home world (velocity + history) ---')
  let p2Completed = 0
  const p2Start = performance.now()
  const homeResults = await fetchHomeListings(itemIds, (done, total) => {
    p2Completed = done
    if (done === total || done % 10 === 0) {
      const elapsed = performance.now() - p2Start
      const rate = done / (elapsed / 1000)
      process.stdout.write(`\r  ${done}/${total} batches  (${rate.toFixed(1)} batch/s)`)
    }
  })
  const p2Time = performance.now() - p2Start
  console.log()
  const homeItemCount = homeResults.length
  console.log(`  Items returned: ${homeItemCount}`)
  console.log(`  Time: ${fmt(p2Time)}  (${(p2Completed / (p2Time / 1000)).toFixed(1)} batch/s, ${(homeItemCount / (p2Time / 1000)).toFixed(0)} items/s)`)
  console.log()

  // Summary
  const totalTime = p0Time + p1Time + p2Time
  console.log('=== Summary ===')
  console.log(`  Items scanned:    ${itemIds.length}`)
  console.log(`  Phase 0 (items):  ${fmt(p0Time)}`)
  console.log(`  Phase 1 (DC):     ${fmt(p1Time)}`)
  console.log(`  Phase 2 (Home):   ${fmt(p2Time)}`)
  console.log(`  Total wall-clock: ${fmt(totalTime)}`)
  console.log(`  Throughput:       ${(itemIds.length / (totalTime / 1000)).toFixed(0)} items/s`)
  console.log(`  HTTP batches:     ${totalBatches * 2 + 1} (${totalBatches} × 2 phases + 1 marketable)`)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
