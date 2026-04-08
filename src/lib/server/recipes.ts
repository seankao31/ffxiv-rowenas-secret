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

export async function loadRecipes(
  path = DEFAULT_RECIPES_PATH,
): Promise<Recipe[]> {
  const { decode } = await import('@msgpack/msgpack')
  const bytes = await readFile(path)
  const data = decode(bytes) as Recipe[]
  console.log(`[recipes] Loaded ${data.length} recipes from FFXIV_Market`)
  return data
}
