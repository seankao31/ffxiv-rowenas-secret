// scripts/benchmark-scan.ts
// Usage: bun scripts/benchmark-scan.ts [--items N] [--strategy dc|per-world]

import { fetchMarketableItems, fetchDCListings, fetchHomeListings, fetchWorldListings, DC_WORLDS } from '../src/server/universalis.ts'

const BATCH_SIZE = 100

function parseArgs(): { maxItems?: number; strategy: 'dc' | 'per-world' } {
  const itemsIdx = process.argv.indexOf('--items')
  const stratIdx = process.argv.indexOf('--strategy')
  return {
    maxItems: itemsIdx !== -1 && process.argv[itemsIdx + 1]
      ? parseInt(process.argv[itemsIdx + 1], 10)
      : undefined,
    strategy: (stratIdx !== -1 && process.argv[stratIdx + 1] === 'dc') ? 'dc' : 'per-world',
  }
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

async function benchmarkDC(itemIds: number[]) {
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)

  console.log('--- Phase 1: DC listings (all worlds in one response) ---')
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
  console.log()
  const dcListingCount = dcResults.reduce((sum, r) => sum + r.listings.length, 0)
  console.log(`  Items returned: ${dcResults.length}`)
  console.log(`  Total listings: ${dcListingCount}`)
  console.log(`  Time: ${fmt(p1Time)}  (${(p1Completed / (p1Time / 1000)).toFixed(1)} batch/s, ${(dcResults.length / (p1Time / 1000)).toFixed(0)} items/s)`)

  return { p1Time, itemCount: dcResults.length, listingCount: dcListingCount, batches: totalBatches }
}

async function benchmarkPerWorld(itemIds: number[]) {
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)
  let totalListings = 0
  const worldTimings: { name: string; time: number; items: number }[] = []

  console.log(`--- Phase 1: Per-world listings (${DC_WORLDS.length} worlds sequential) ---`)
  const p1Start = performance.now()

  for (const world of DC_WORLDS) {
    const worldStart = performance.now()
    console.log(`  ${world.name}...`)
    const results = await fetchWorldListings(world, itemIds, (done, total) => {
      if (done === total || done % 10 === 0) {
        const elapsed = performance.now() - worldStart
        const rate = done / (elapsed / 1000)
        process.stdout.write(`\r    ${done}/${total} batches  (${rate.toFixed(1)} batch/s)`)
      }
    })
    const worldTime = performance.now() - worldStart
    console.log()
    const listings = results.reduce((sum, r) => sum + r.listings.length, 0)
    totalListings += listings
    worldTimings.push({ name: world.name, time: worldTime, items: results.length })
    console.log(`    ${world.name}: ${fmt(worldTime)}, ${results.length} items, ${listings} listings`)
  }

  const p1Time = performance.now() - p1Start
  console.log()
  console.log('  Per-world summary:')
  for (const w of worldTimings) {
    console.log(`    ${w.name}: ${fmt(w.time)}`)
  }
  console.log(`  Total Phase 1: ${fmt(p1Time)}`)
  console.log(`  Total listings: ${totalListings}`)

  return { p1Time, itemCount: itemIds.length, listingCount: totalListings, batches: totalBatches * DC_WORLDS.length }
}

async function main() {
  const { maxItems, strategy } = parseArgs()

  console.log(`Strategy: ${strategy}`)
  console.log()

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
  console.log()

  // Phase 1: strategy-dependent
  const p1Result = strategy === 'dc'
    ? await benchmarkDC(itemIds)
    : await benchmarkPerWorld(itemIds)
  console.log()

  // Phase 2: Home world (same for both strategies)
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)
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
  console.log(`  Items returned: ${homeResults.length}`)
  console.log(`  Time: ${fmt(p2Time)}  (${(p2Completed / (p2Time / 1000)).toFixed(1)} batch/s, ${(homeResults.length / (p2Time / 1000)).toFixed(0)} items/s)`)
  console.log()

  // Summary
  const totalTime = p0Time + p1Result.p1Time + p2Time
  console.log('=== Summary ===')
  console.log(`  Strategy:         ${strategy}`)
  console.log(`  Items scanned:    ${itemIds.length}`)
  console.log(`  Phase 0 (items):  ${fmt(p0Time)}`)
  console.log(`  Phase 1 (${strategy === 'dc' ? 'DC' : 'per-world'}):${strategy === 'dc' ? '     ' : ' '}${fmt(p1Result.p1Time)}`)
  console.log(`  Phase 2 (Home):   ${fmt(p2Time)}`)
  console.log(`  Total wall-clock: ${fmt(totalTime)}`)
  console.log(`  Throughput:       ${(itemIds.length / (totalTime / 1000)).toFixed(0)} items/s`)
  console.log(`  HTTP batches:     ${p1Result.batches + totalBatches + 1}`)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
