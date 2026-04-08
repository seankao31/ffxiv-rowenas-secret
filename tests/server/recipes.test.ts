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
})

describe('resolveIngredientTree', () => {
  const fixtureDir = join(tmpdir(), `rowenas-recipes-tree-${process.pid}`)
  const originalLog = console.log

  // Crafting chain:
  //   Item 300 (final product) = 2x Item 301 + 1x Item 302
  //   Item 301 (intermediate)  = 3x Item 303  (yields 1)
  //   Item 302 (raw material)  = no recipe (leaf)
  //   Item 303 (raw material)  = no recipe (leaf)
  const fixtures = [
    { id: 10, result: 300, job: 8, lvl: 50, yields: 1, ingredients: [{ id: 301, amount: 2 }, { id: 302, amount: 1 }] },
    { id: 11, result: 301, job: 8, lvl: 40, yields: 1, ingredients: [{ id: 303, amount: 3 }] },
  ]

  beforeAll(async () => {
    await mkdir(fixtureDir, { recursive: true })
    const fixturePath = join(fixtureDir, 'recipes-tree.msgpack')
    await writeFile(fixturePath, encode(fixtures))

    console.log = vi.fn(() => {}) as typeof console.log
    // Re-init with tree fixtures (replaces prior indexes)
    const { initRecipes } = await import('$lib/server/recipes')
    await initRecipes(fixturePath)
  })

  afterAll(async () => {
    console.log = originalLog
    await rm(fixtureDir, { recursive: true })
  })

  test('returns null for item with no recipe', async () => {
    const { resolveIngredientTree } = await import('$lib/server/recipes')

    const tree = resolveIngredientTree(302)

    expect(tree).toBeNull()
  })

  test('resolves single-level recipe (no intermediate crafts)', async () => {
    const { resolveIngredientTree } = await import('$lib/server/recipes')

    // Item 301 needs 3x Item 303 (a leaf)
    const tree = resolveIngredientTree(301)

    expect(tree).not.toBeNull()
    expect(tree!.itemId).toBe(301)
    expect(tree!.amount).toBe(1)
    expect(tree!.recipe!.id).toBe(11)
    expect(tree!.ingredients).toHaveLength(1)
    expect(tree!.ingredients[0]!.itemId).toBe(303)
    expect(tree!.ingredients[0]!.amount).toBe(3)
    expect(tree!.ingredients[0]!.recipe).toBeNull()
    expect(tree!.ingredients[0]!.ingredients).toEqual([])
  })

  test('resolves multi-level recursive tree', async () => {
    const { resolveIngredientTree } = await import('$lib/server/recipes')

    // Item 300 = 2x Item 301 (craftable) + 1x Item 302 (leaf)
    // Item 301 (needed: 2) = ceil(2/1)=2 crafts * 3x Item 303 = 6x Item 303
    const tree = resolveIngredientTree(300)

    expect(tree).not.toBeNull()
    expect(tree!.itemId).toBe(300)
    expect(tree!.ingredients).toHaveLength(2)

    const ing301 = tree!.ingredients.find(i => i.itemId === 301)!
    expect(ing301.amount).toBe(2)
    expect(ing301.recipe).not.toBeNull()
    expect(ing301.ingredients).toHaveLength(1)
    expect(ing301.ingredients[0]!.itemId).toBe(303)
    expect(ing301.ingredients[0]!.amount).toBe(6)

    const ing302 = tree!.ingredients.find(i => i.itemId === 302)!
    expect(ing302.amount).toBe(1)
    expect(ing302.recipe).toBeNull()
    expect(ing302.ingredients).toEqual([])
  })

  test('respects requested amount', async () => {
    const { resolveIngredientTree } = await import('$lib/server/recipes')

    const tree = resolveIngredientTree(300, 5)

    expect(tree!.amount).toBe(5)
  })

  test('respects yields > 1 when calculating craft count', async () => {
    // Need a recipe with yields > 1 to test this
    // Use a fresh fixture set for this specific test
    const yieldDir = join(fixtureDir, 'yields')
    await mkdir(yieldDir, { recursive: true })

    // Item 400 yields 3 per craft, needs 2x Item 401
    const yieldFixtures = [
      { id: 20, result: 400, job: 8, lvl: 50, yields: 3, ingredients: [{ id: 401, amount: 2 }] },
    ]
    const fixturePath = join(yieldDir, 'recipes-yields.msgpack')
    await writeFile(fixturePath, encode(yieldFixtures))

    console.log = vi.fn(() => {}) as typeof console.log
    const { initRecipes, resolveIngredientTree } = await import('$lib/server/recipes')
    await initRecipes(fixturePath)

    // Request 5 units of item 400. yields=3, so need ceil(5/3)=2 crafts.
    // Each craft uses 2x item 401, so total = 2 * 2 = 4 units of item 401.
    const tree = resolveIngredientTree(400, 5)

    expect(tree!.amount).toBe(5)
    expect(tree!.ingredients[0]!.itemId).toBe(401)
    expect(tree!.ingredients[0]!.amount).toBe(4)
  })
})
