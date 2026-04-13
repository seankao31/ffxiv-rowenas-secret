import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { encode } from '@msgpack/msgpack'
import { initRecipes } from '$lib/server/recipes'
import type { Recipe } from '$lib/server/recipes'
import { seedFixtureData } from '$lib/server/fixtures/seed'
import { getAllItems, getNameMap, isCacheReady, getScanMeta, getCraftCosts } from '$lib/server/cache'

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
})
