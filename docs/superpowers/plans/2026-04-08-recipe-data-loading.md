# Recipe Data Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load `recipes.msgpack` server-side at startup, build in-memory indexes, and expose query functions for recipe lookup by result item and ingredient item — enabling crafting tree construction.

**Architecture:** New `src/lib/server/recipes.ts` module follows the existing msgpack loading pattern (readFile → decode → transform). Builds two `Map` indexes (by-result-item-id, by-ingredient-item-id) at load time. Exports query functions and a recursive ingredient tree resolver. Loaded eagerly in `hooks.server.ts` alongside existing startup tasks.

**Tech Stack:** `@msgpack/msgpack` (already installed), `node:fs/promises`, vitest

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/server/recipes.ts` | Load msgpack, build indexes, expose query functions |
| Create | `tests/server/recipes.test.ts` | Tests for loading, indexing, queries, and tree resolution |
| Modify | `src/hooks.server.ts` | Call `initRecipes()` at server startup |

---

### Task 1: Recipe Loading and Decode

Load `recipes.msgpack` from disk, decode it, and return typed `Recipe[]`.

**Files:**
- Create: `src/lib/server/recipes.ts`
- Create: `tests/server/recipes.test.ts`

- [x] **Step 1: Write failing test for loadRecipes**

Create `tests/server/recipes.test.ts`:

```typescript
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: FAIL — module `$lib/server/recipes` does not exist

- [x] **Step 3: Write minimal implementation**

Create `src/lib/server/recipes.ts`:

```typescript
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: PASS (all 4 tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/server/recipes.ts tests/server/recipes.test.ts
git commit -m "feat(ENG-87): add recipe msgpack loading with types"
```

---

### Task 2: By-Result Index and Query

Build a `Map<number, Recipe[]>` index keyed by result item ID. Expose `getRecipesByResult(itemId)`.

**Files:**
- Modify: `src/lib/server/recipes.ts`
- Modify: `tests/server/recipes.test.ts`

- [x] **Step 1: Write failing tests for initRecipes and getRecipesByResult**

Add to `tests/server/recipes.test.ts`:

```typescript
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
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: FAIL — `initRecipes` and `getRecipesByResult` not exported

- [x] **Step 3: Write minimal implementation**

Add to `src/lib/server/recipes.ts`:

```typescript
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: PASS (all tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/server/recipes.ts tests/server/recipes.test.ts
git commit -m "feat(ENG-87): add by-result recipe index and query"
```

---

### Task 3: By-Ingredient Index and Query

Expose `getRecipesByIngredient(itemId)` using the index built in Task 2.

**Files:**
- Modify: `src/lib/server/recipes.ts`
- Modify: `tests/server/recipes.test.ts`

- [x] **Step 1: Write failing tests for getRecipesByIngredient**

Add to the `'recipe indexes'` describe block in `tests/server/recipes.test.ts`:

```typescript
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: FAIL — `getRecipesByIngredient` not exported

- [x] **Step 3: Write minimal implementation**

Add to `src/lib/server/recipes.ts` (the `byIngredient` index is already built in `initRecipes` from Task 2):

```typescript
export function getRecipesByIngredient(itemId: number): Recipe[] {
  return byIngredient.get(itemId) ?? []
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: PASS (all tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/server/recipes.ts tests/server/recipes.test.ts
git commit -m "feat(ENG-87): add by-ingredient recipe index and query"
```

---

### Task 4: Recursive Ingredient Tree Resolution

Implement `resolveIngredientTree(itemId, amount)` that recursively resolves a crafting tree — following ingredient chains through `getRecipesByResult` until reaching leaf materials (items with no recipe).

**Files:**
- Modify: `src/lib/server/recipes.ts`
- Modify: `tests/server/recipes.test.ts`

- [x] **Step 1: Write failing tests for resolveIngredientTree**

Add a new describe block to `tests/server/recipes.test.ts`:

```typescript
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
    // Item 301 = 3x Item 303 (leaf)
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: FAIL — `resolveIngredientTree` not exported

- [x] **Step 3: Write minimal implementation**

Add to `src/lib/server/recipes.ts`:

```typescript
export type IngredientNode = {
  itemId: number
  amount: number
  recipe: Recipe | null
  ingredients: IngredientNode[]
}

export function resolveIngredientTree(
  itemId: number,
  amount = 1,
): IngredientNode | null {
  const recipes = getRecipesByResult(itemId)
  if (recipes.length === 0) return null

  // Use first recipe (caller can choose among alternatives via getRecipesByResult)
  const recipe = recipes[0]!
  const craftCount = Math.ceil(amount / recipe.yields)

  const ingredients: IngredientNode[] = recipe.ingredients.map(ing => {
    const totalNeeded = ing.amount * craftCount
    const subRecipes = getRecipesByResult(ing.id)
    if (subRecipes.length === 0) {
      return { itemId: ing.id, amount: totalNeeded, recipe: null, ingredients: [] }
    }
    return resolveIngredientTree(ing.id, totalNeeded)!
  })

  return { itemId, amount, recipe, ingredients }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: PASS (all tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/server/recipes.ts tests/server/recipes.test.ts
git commit -m "feat(ENG-87): add recursive ingredient tree resolution"
```

---

### Task 5: Server Startup Integration

Wire `initRecipes()` into the SvelteKit server init hook so recipes load at startup.

**Files:**
- Modify: `src/hooks.server.ts`

- [x] **Step 1: Add initRecipes call to hooks.server.ts**

Modify `src/hooks.server.ts` to import and call `initRecipes`:

```typescript
import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices } from '$lib/server/vendors'
import { initRecipes } from '$lib/server/recipes'
import { setVendorPrices } from '$lib/server/cache'

export async function init() {
  // Recipe data and vendor prices load concurrently (both are independent).
  // Recipe data is local disk I/O — fast and must succeed.
  // If XIVAPI is down after retries, the app runs without vendor arbitrage data.
  const recipePromise = initRecipes().catch(err => {
    console.error('[server] Recipe loading failed:', err)
    process.exit(1)
  })

  fetchVendorPrices()
    .then(prices => {
      if (prices.size > 0) setVendorPrices(prices)
    })
    .catch(err => {
      console.error('[server] Vendor price fetch failed after retries:', err)
    })

  await recipePromise

  startScanner().catch(err => {
    console.error('[server] Scanner crashed:', err)
    process.exit(1)
  })
}
```

Note: `initRecipes()` calls `process.exit(1)` on failure because recipes are required data — the app cannot meaningfully function without them (unlike vendor prices which are optional).

- [x] **Step 2: Run full test suite**

Run: `bun run test`
Expected: All existing tests PASS, new recipe tests PASS

- [x] **Step 3: Commit**

```bash
git add src/hooks.server.ts
git commit -m "feat(ENG-87): load recipe data at server startup"
```

- [x] **Step 4: Manual verification with dev server**

Run: `bun run dev`
Expected: Console output includes:
- `[recipes] Loaded N recipes from FFXIV_Market`
- `[recipes] Built indexes: N result items, N ingredient items`

These should appear before the scanner starts its first cycle.

---

## Acceptance Criteria Traceability

| Criterion | Task |
|-----------|------|
| `recipes.msgpack` decoded at server startup, kept in Node.js memory | Task 1 (loading) + Task 5 (startup hook) |
| Indexes: by-result-item-id, by-ingredient-item-id | Task 2 + Task 3 |
| API or loader can answer: "what recipes produce item X?" | Task 2: `getRecipesByResult()` |
| API or loader can answer: "what recipes use item X as ingredient?" | Task 3: `getRecipesByIngredient()` |
| Crafting tree construction possible (recursive ingredient resolution) | Task 4: `resolveIngredientTree()` |
