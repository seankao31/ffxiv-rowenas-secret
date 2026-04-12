import { test, expect, describe, beforeAll, afterAll, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { encode } from '@msgpack/msgpack'
import { initRecipes } from '$lib/server/recipes'
import type { Recipe } from '$lib/server/recipes'
import { setItem, setScanMeta, setVendorPrices } from '$lib/server/cache'
import type { ItemData, Listing } from '$lib/shared/types'

const WORLD_A = 4033
const NOW = Date.now()
const FRESH = NOW - 30 * 60_000

const READY_META = { scanCompletedAt: NOW, itemsScanned: 1, itemsWithOpportunities: 0, nextScanEstimatedAt: 0 }
const NOT_READY_META = { scanCompletedAt: 0, itemsScanned: 0, itemsWithOpportunities: 0, nextScanEstimatedAt: 0 }

const TEST_RECIPES: Recipe[] = [
  // Item 100: yields 1. Ingredients: item 10 x3, item 11 x2
  { id: 1, result: 100, job: 8, lvl: 50, yields: 1,
    ingredients: [{ id: 10, amount: 3 }, { id: 11, amount: 2 }] },
]

function listing(price: number, worldId = WORLD_A, worldName = 'TestWorld'): Listing {
  return { pricePerUnit: price, quantity: 10, worldID: worldId, worldName, lastReviewTime: FRESH, hq: false }
}

function itemData(itemId: number, listings: Listing[]): ItemData {
  const worldUploadTimes: Record<number, number> = {}
  for (const l of listings) worldUploadTimes[l.worldID] = l.lastReviewTime
  return { itemID: itemId, worldUploadTimes, homeLastUploadTime: FRESH, listings,
    regularSaleVelocity: 5, hqSaleVelocity: 2, recentHistory: [] }
}

const fixtureDir = join(tmpdir(), `rowenas-craft-api-test-${process.pid}`)

let GET: typeof import('../../src/routes/api/craft/[id]/+server').GET

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true })
  await writeFile(join(fixtureDir, 'recipes.msgpack'), encode(TEST_RECIPES))
  await initRecipes(join(fixtureDir, 'recipes.msgpack'))
  const mod = await import('../../src/routes/api/craft/[id]/+server')
  GET = mod.GET
})

afterAll(async () => {
  await rm(fixtureDir, { recursive: true })
})

afterEach(() => {
  setScanMeta(NOT_READY_META)
  setVendorPrices(new Map())
})

describe('GET /api/craft/[id]', () => {
  test('returns 202 when cache is not ready', async () => {
    // scanMeta.scanCompletedAt is 0 by default — cache not ready
    const response = await GET({ params: { id: '100' } } as any)
    expect(response.status).toBe(202)
  })

  test('returns 400 for non-integer id', async () => {
    setScanMeta(READY_META)
    const response = await GET({ params: { id: 'abc' } } as any)
    expect(response.status).toBe(400)
  })

  test('returns 400 for zero id', async () => {
    setScanMeta(READY_META)
    const response = await GET({ params: { id: '0' } } as any)
    expect(response.status).toBe(400)
  })

  test('returns 400 for negative id', async () => {
    setScanMeta(READY_META)
    const response = await GET({ params: { id: '-1' } } as any)
    expect(response.status).toBe(400)
  })

  test('returns 400 for decimal id', async () => {
    setScanMeta(READY_META)
    const response = await GET({ params: { id: '2.5' } } as any)
    expect(response.status).toBe(400)
  })

  test('returns 404 when item has no recipe', async () => {
    setScanMeta(READY_META)
    setItem(itemData(10, [listing(100)]))
    // Item 10 has no recipe in TEST_RECIPES
    const response = await GET({ params: { id: '10' } } as any)
    expect(response.status).toBe(404)
  })

  test('returns crafting breakdown with recommendation craft when crafting is cheaper', async () => {
    setScanMeta(READY_META)
    setItem(itemData(100, [listing(600)]))  // market: 600×1.05=630
    setItem(itemData(10, [listing(100)]))
    setItem(itemData(11, [listing(100)]))
    // craft cost: 3×100×1.05 + 2×100×1.05 = 525 < 630
    const response = await GET({ params: { id: '100' } } as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.totalCost).toBe(525)
    expect(body.recommendation).toBe('craft')
    expect(typeof body.confidence).toBe('number')
    expect(body.root).toBeDefined()
  })

  test('recommendation is buy when buying is cheaper than crafting', async () => {
    setScanMeta(READY_META)
    setItem(itemData(100, [listing(400)]))  // market: 400×1.05=420, craft would be more
    setItem(itemData(10, [listing(500)]))   // expensive ingredients
    setItem(itemData(11, [listing(500)]))
    // craft cost: 3×500×1.05 + 2×500×1.05 = 2625 > 420 (buy wins)
    const response = await GET({ params: { id: '100' } } as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.recommendation).toBe('buy')
  })
})
