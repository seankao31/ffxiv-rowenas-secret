import { test, expect, describe, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { encode } from '@msgpack/msgpack'

describe('loadRecipes', () => {
  const fixtureDir = join(tmpdir(), `rowenas-recipes-test-${process.pid}`)
  const originalLog = console.log

  beforeAll(async () => {
    await mkdir(fixtureDir, { recursive: true })
  })

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true })
  })

  afterEach(() => {
    console.log = originalLog
  })

  test('decodes msgpack recipes into Recipe array', async () => {
    console.log = vi.fn(() => {}) as typeof console.log
    const { loadRecipes } = await import('$lib/server/recipes')

    const fixtures = [
      { id: 1, result: 100, job: 8, lvl: 50, yields: 1, ingredients: [{ id: 2, amount: 3 }, { id: 3, amount: 1 }] },
      { id: 2, result: 200, job: 9, lvl: 60, yields: 3, ingredients: [{ id: 4, amount: 2 }] },
    ]
    const fixturePath = join(fixtureDir, 'recipes-valid.msgpack')
    await writeFile(fixturePath, encode(fixtures))

    const recipes = await loadRecipes(fixturePath)

    expect(recipes).toHaveLength(2)
    expect(recipes[0]).toEqual({
      id: 1, result: 100, job: 8, lvl: 50, yields: 1,
      ingredients: [{ id: 2, amount: 3 }, { id: 3, amount: 1 }],
    })
    expect(recipes[1]).toEqual({
      id: 2, result: 200, job: 9, lvl: 60, yields: 3,
      ingredients: [{ id: 4, amount: 2 }],
    })
    expect(console.log).toHaveBeenCalledWith('[recipes] Loaded 2 recipes from FFXIV_Market')
  })

  test('handles companyCraft recipes', async () => {
    console.log = vi.fn(() => {}) as typeof console.log
    const { loadRecipes } = await import('$lib/server/recipes')

    const fixtures = [
      { id: 10, result: 500, job: 8, lvl: 1, yields: 1, ingredients: [{ id: 6, amount: 10 }], companyCraft: true },
    ]
    const fixturePath = join(fixtureDir, 'recipes-company.msgpack')
    await writeFile(fixturePath, encode(fixtures))

    const recipes = await loadRecipes(fixturePath)

    expect(recipes[0]!.companyCraft).toBe(true)
  })

  test('throws when file does not exist', async () => {
    const { loadRecipes } = await import('$lib/server/recipes')

    await expect(loadRecipes(join(fixtureDir, 'nonexistent.msgpack')))
      .rejects.toThrow()
  })

  test('throws on corrupt msgpack payload', async () => {
    const { loadRecipes } = await import('$lib/server/recipes')

    const fixturePath = join(fixtureDir, 'recipes-corrupt.msgpack')
    await writeFile(fixturePath, new Uint8Array([0xff, 0xfe, 0x00]))

    await expect(loadRecipes(fixturePath))
      .rejects.toThrow()
  })
})

describe('recipe indexes', () => {
  const fixtureDir = join(tmpdir(), `rowenas-recipes-idx-${process.pid}`)
  const originalLog = console.log

  // Three recipes: two produce item 100 (different jobs), one produces item 200
  const fixtures = [
    { id: 1, result: 100, job: 8, lvl: 50, yields: 1, ingredients: [{ id: 10, amount: 3 }] },
    { id: 2, result: 100, job: 9, lvl: 55, yields: 1, ingredients: [{ id: 11, amount: 2 }] },
    { id: 3, result: 200, job: 8, lvl: 60, yields: 3, ingredients: [{ id: 10, amount: 5 }, { id: 12, amount: 1 }] },
  ]

  beforeAll(async () => {
    await mkdir(fixtureDir, { recursive: true })
    const fixturePath = join(fixtureDir, 'recipes-index.msgpack')
    await writeFile(fixturePath, encode(fixtures))

    console.log = vi.fn(() => {}) as typeof console.log
    const { initRecipes } = await import('$lib/server/recipes')
    await initRecipes(fixturePath)
  })

  afterAll(async () => {
    console.log = originalLog
    await rm(fixtureDir, { recursive: true })
  })

  test('getRecipesByResult returns all recipes producing an item', async () => {
    const { getRecipesByResult } = await import('$lib/server/recipes')

    const recipes = getRecipesByResult(100)

    expect(recipes).toHaveLength(2)
    expect(recipes.map(r => r.id).sort()).toEqual([1, 2])
  })

  test('getRecipesByResult returns single recipe for unique result', async () => {
    const { getRecipesByResult } = await import('$lib/server/recipes')

    const recipes = getRecipesByResult(200)

    expect(recipes).toHaveLength(1)
    expect(recipes[0]!.id).toBe(3)
  })

  test('getRecipesByResult returns empty array for unknown item', async () => {
    const { getRecipesByResult } = await import('$lib/server/recipes')

    const recipes = getRecipesByResult(99999)

    expect(recipes).toEqual([])
  })

  test('getRecipesByIngredient returns recipes using an item as ingredient', async () => {
    const { getRecipesByIngredient } = await import('$lib/server/recipes')

    // Item 10 is used in recipe 1 (for item 100) and recipe 3 (for item 200)
    const recipes = getRecipesByIngredient(10)

    expect(recipes).toHaveLength(2)
    expect(recipes.map(r => r.id).sort()).toEqual([1, 3])
  })

  test('getRecipesByIngredient returns single recipe for ingredient used once', async () => {
    const { getRecipesByIngredient } = await import('$lib/server/recipes')

    // Item 12 is only used in recipe 3
    const recipes = getRecipesByIngredient(12)

    expect(recipes).toHaveLength(1)
    expect(recipes[0]!.id).toBe(3)
  })

  test('getRecipesByIngredient returns empty array for non-ingredient item', async () => {
    const { getRecipesByIngredient } = await import('$lib/server/recipes')

    const recipes = getRecipesByIngredient(99999)

    expect(recipes).toEqual([])
  })

  test('getAllRecipeResultIds returns all unique result item IDs', async () => {
    const { getAllRecipeResultIds } = await import('$lib/server/recipes')

    const ids = getAllRecipeResultIds()
    expect(ids.length).toBeGreaterThan(0)
    // Should contain no duplicates
    expect(new Set(ids).size).toBe(ids.length)
  })
})
