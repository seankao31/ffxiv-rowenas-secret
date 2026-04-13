import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type Ingredient = {
  id: number
  amount: number
}

export type Recipe = {
  id: number
  result: number
  job: number
  lvl: number
  yields: number
  ingredients: Ingredient[]
  companyCraft?: boolean
}

const DEFAULT_RECIPES_PATH = join(process.cwd(), 'data', 'recipes.msgpack')

// Module-level indexes (populated by initRecipes)
const byResult = new Map<number, Recipe[]>()
const byIngredient = new Map<number, Recipe[]>()

export async function initRecipes(
  path = DEFAULT_RECIPES_PATH,
): Promise<void> {
  const recipes = await loadRecipes(path)

  byResult.clear()
  byIngredient.clear()

  for (const recipe of recipes) {
    // Index by result item
    const resultList = byResult.get(recipe.result)
    if (resultList) resultList.push(recipe)
    else byResult.set(recipe.result, [recipe])

    // Index by ingredient item
    for (const ing of recipe.ingredients) {
      const ingList = byIngredient.get(ing.id)
      if (ingList) ingList.push(recipe)
      else byIngredient.set(ing.id, [recipe])
    }
  }

  console.log(`[recipes] Built indexes: ${byResult.size} result items, ${byIngredient.size} ingredient items`)
}

export function getRecipesByResult(itemId: number): Recipe[] {
  return byResult.get(itemId) ?? []
}

export function getRecipesByIngredient(itemId: number): Recipe[] {
  return byIngredient.get(itemId) ?? []
}

export function getAllRecipeResultIds(): number[] {
  return [...byResult.keys()]
}

export async function loadRecipes(
  path = DEFAULT_RECIPES_PATH,
): Promise<Recipe[]> {
  const { decode } = await import('@msgpack/msgpack')
  const bytes = await readFile(path)
  const data = decode(bytes) as Recipe[]
  console.log(`[recipes] Loaded ${data.length} recipes from FFXIV_Market`)
  return data
}
