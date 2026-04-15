import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { encode } from '@msgpack/msgpack'
import { initRecipes } from '$lib/server/recipes'
import type { Recipe } from '$lib/server/recipes'
import { seedFixtureData } from '$lib/server/fixtures/seed'
import { getAllItems, getNameMap, isCacheReady, getScanMeta, getCraftCosts } from '$lib/server/cache'
import type { ItemData } from '$lib/shared/types'

// A minimal recipe using item IDs that exist in snapshot.json.
// Item 3096 (1250 gil) is crafted from item 4858 (3 gil) — craft is cheaper than buying.
const FIXTURE_RECIPES: Recipe[] = [
  { id: 9001, result: 3096, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 4858, amount: 1 }] },
]

const fixtureDir = join(tmpdir(), `rowenas-fixtures-test-${process.pid}`)
const originalLog = console.log

beforeAll(async () => {
  console.log = vi.fn(() => {}) as typeof console.log
  await mkdir(fixtureDir, { recursive: true })
  await writeFile(join(fixtureDir, 'recipes.msgpack'), encode(FIXTURE_RECIPES))
  await initRecipes(join(fixtureDir, 'recipes.msgpack'))
})

afterAll(async () => {
  console.log = originalLog
  await rm(fixtureDir, { recursive: true })
})

describe('seedFixtureData', () => {
  test('populates item cache from snapshot', () => {
    seedFixtureData()

    const items = getAllItems()
    expect(items.size).toBeGreaterThan(0)

    const first = items.values().next().value!
    expect(first.itemID).toBeTypeOf('number')
    expect(first.listings.length).toBeGreaterThan(0)
    expect(first.regularSaleVelocity).toBeTypeOf('number')
  })

  test('populates name cache from snapshot', () => {
    seedFixtureData()

    const names = getNameMap()
    expect(names.size).toBeGreaterThan(0)

    const items = getAllItems()
    const firstId = items.keys().next().value!
    expect(names.get(firstId)).toBeTypeOf('string')
  })

  test('marks cache as ready', () => {
    seedFixtureData()

    expect(isCacheReady()).toBe(true)

    const meta = getScanMeta()
    expect(meta.scanCompletedAt).toBeGreaterThan(0)
    expect(meta.itemsScanned).toBeGreaterThan(0)
  })

  test('populates craft cost cache', () => {
    seedFixtureData()

    const costs = getCraftCosts()
    expect(costs.size).toBeGreaterThan(0)

    const first = costs.values().next().value!
    expect(first.itemId).toBeTypeOf('number')
    expect(first.recipeId).toBeTypeOf('number')
    expect(first.craftCost).toBeTypeOf('number')
    expect(first.confidence).toBeTypeOf('number')
  })

  test('rebases timestamps so the newest aligns with now', () => {
    const before = Date.now()
    seedFixtureData()

    const items = getAllItems()

    // Find the max timestamp across all items after rebasing
    let maxMs = 0
    for (const item of items.values()) {
      for (const ts of Object.values(item.worldUploadTimes)) {
        if (ts > maxMs) maxMs = ts
      }
      if (item.homeLastUploadTime > maxMs) maxMs = item.homeLastUploadTime
      for (const listing of item.listings) {
        if (listing.lastReviewTime > maxMs) maxMs = listing.lastReviewTime
      }
      for (const sale of item.recentHistory) {
        const tsMs = sale.timestamp * 1000
        if (tsMs > maxMs) maxMs = tsMs
      }
    }

    // The newest timestamp should be approximately now (within 1 second)
    expect(Math.abs(maxMs - before)).toBeLessThan(1_000)
  })

  test('all timestamps shift forward by the same offset', () => {
    // Read raw snapshot to get original timestamps
    const snapshotPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../src/lib/server/fixtures/snapshot.json'
    )
    const raw = readFileSync(snapshotPath, 'utf-8')
    const original: { items: ItemData[] } = JSON.parse(raw)
    const origFirst = original.items[0]!

    seedFixtureData()

    const rebasedFirst = getAllItems().get(origFirst.itemID)!

    // The offset should be the same for all timestamp fields
    const origWorldTs = Object.values(origFirst.worldUploadTimes).find(ts => ts > 0)!
    const worldId = Object.entries(origFirst.worldUploadTimes).find(([, ts]) => ts > 0)![0]
    const rebasedWorldTs = rebasedFirst.worldUploadTimes[Number(worldId)]!
    const offsetMs = rebasedWorldTs - origWorldTs

    // offset should be positive (shifted forward)
    expect(offsetMs).toBeGreaterThan(0)

    // homeLastUploadTime should shift by the same offset
    if (origFirst.homeLastUploadTime > 0) {
      expect(rebasedFirst.homeLastUploadTime - origFirst.homeLastUploadTime)
        .toBe(offsetMs)
    }

    // listing lastReviewTime should shift by the same offset
    expect(rebasedFirst.listings[0]!.lastReviewTime - origFirst.listings[0]!.lastReviewTime)
      .toBe(offsetMs)

    // recentHistory timestamps (seconds) should shift by floor(offsetMs / 1000)
    if (origFirst.recentHistory.length > 0) {
      const offsetSec = Math.floor(offsetMs / 1000)
      expect(rebasedFirst.recentHistory[0]!.timestamp - origFirst.recentHistory[0]!.timestamp)
        .toBe(offsetSec)
    }
  })
})
