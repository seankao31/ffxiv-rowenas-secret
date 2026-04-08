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
