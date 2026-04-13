import { describe, it, expect, beforeAll } from 'vitest'
import { initRecipes } from '$lib/server/recipes'
import { getRecipesByResult } from '$lib/server/recipes'

describe('getRecipesByResult for hasRecipe check', () => {
  beforeAll(async () => {
    await initRecipes()
  })

  it('returns non-empty array for a known craftable item', () => {
    const recipes = getRecipesByResult(2394)
    expect(recipes.length).toBeGreaterThan(0)
  })

  it('returns empty array for a non-craftable item', () => {
    const recipes = getRecipesByResult(5111)
    expect(recipes).toEqual([])
  })
})
