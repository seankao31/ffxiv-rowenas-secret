# Batch Crafting Cost Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Final review includes cross-model verification via codex-review-gate.

**Goal:** Compute cheapest crafting cost for every recipe after each market scan cycle, storing thin results in an in-memory cache for downstream ranking consumers.

**Architecture:** New `solveCraftCostBatch()` function in `crafting.ts` iterates all recipe result items with a shared memo, producing `Map<number, CraftCostEntry>`. Scanner calls it synchronously after each cycle. Results stored via new cache accessors.

**Tech Stack:** TypeScript, Vitest, existing crafting solver (`solveNode`), recipe indexes, scanner cache

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/shared/types.ts` | Modify | Add `CraftCostEntry` type |
| `src/lib/server/recipes.ts` | Modify | Add `getAllRecipeResultIds()` accessor |
| `src/lib/server/crafting.ts` | Modify | Add `solveCraftCostBatch()` function |
| `src/lib/server/cache.ts` | Modify | Add craft cost cache + accessors |
| `src/lib/server/scanner.ts` | Modify | Call batch solver after each scan cycle |
| `src/lib/server/fixtures/seed.ts` | Modify | Seed craft cost cache in fixture mode |
| `tests/server/crafting.test.ts` | Modify | Add batch solver tests |
| `tests/server/fixtures.test.ts` | Modify | Add craft cost fixture test |

---

### Task 1: Add `CraftCostEntry` type

**Files:**
- Modify: `src/lib/shared/types.ts:119-120` (after `CraftingResult`)

- [x] **Step 1: Add the type**

Add after the `CraftingResult` type at the end of `src/lib/shared/types.ts`:

```typescript
export type CraftCostEntry = {
  itemId: number       // result item ID
  recipeId: number     // recipe that was cheapest
  job: number          // crafter job for that recipe
  level: number        // required job level
  craftCost: number    // per-unit cost via optimal craft tree
  confidence: number   // min confidence across all ingredients
}
```

- [x] **Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add src/lib/shared/types.ts
git commit -m "feat(server): add CraftCostEntry type

Ref: ENG-69"
```

---

### Task 2: Add `getAllRecipeResultIds()` accessor

The `byResult` map in `recipes.ts` is module-private. The batch solver needs to iterate all craftable item IDs.

**Files:**
- Modify: `src/lib/server/recipes.ts:50-56`
- Test: `tests/server/recipes.test.ts`

- [x] **Step 1: Write the failing test**

Add a new test to `tests/server/recipes.test.ts`:

```typescript
test('getAllRecipeResultIds returns all unique result item IDs', async () => {
  const ids = getAllRecipeResultIds()
  expect(ids.length).toBeGreaterThan(0)
  // Should contain no duplicates
  expect(new Set(ids).size).toBe(ids.length)
})
```

Import `getAllRecipeResultIds` from `$lib/server/recipes` at the top of the file.

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: FAIL — `getAllRecipeResultIds` is not exported

- [x] **Step 3: Implement the accessor**

Add to `src/lib/server/recipes.ts` after the `getRecipesByIngredient` function:

```typescript
export function getAllRecipeResultIds(): number[] {
  return [...byResult.keys()]
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/recipes.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/server/recipes.ts tests/server/recipes.test.ts
git commit -m "feat(server): add getAllRecipeResultIds accessor

Ref: ENG-69"
```

---

### Task 3: Add craft cost cache and accessors

**Files:**
- Modify: `src/lib/server/cache.ts:82-91` (after vendor price accessors)
- Test: Tested implicitly via Task 5 batch tests; no standalone cache test needed

- [x] **Step 1: Add cache state and accessors**

Add to `src/lib/server/cache.ts` after the vendor price section (before `_resetNameCacheState`). Also add the import of `CraftCostEntry` to the type import at line 1.

Update the import line:
```typescript
import type { ItemData, ScanMeta, ScanProgress, CraftCostEntry } from '$lib/shared/types.ts'
```

Add before `_resetNameCacheState`:
```typescript
let craftCostCache = new Map<number, CraftCostEntry>()

export function setCraftCosts(costs: Map<number, CraftCostEntry>): void {
  craftCostCache = costs
}

export function getCraftCosts(): Map<number, CraftCostEntry> {
  return craftCostCache
}
```

- [x] **Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add src/lib/server/cache.ts
git commit -m "feat(server): add craft cost cache and accessors

Ref: ENG-69"
```

---

### Task 4: Implement `solveCraftCostBatch()`

**Files:**
- Modify: `src/lib/server/crafting.ts`

- [x] **Step 1: Add imports**

Add to the imports at the top of `crafting.ts`:

```typescript
import { getAllRecipeResultIds } from '$lib/server/recipes'
```

Update the type import to include `CraftCostEntry`:
```typescript
import type { ItemData, CraftingNode, CraftingResult, CraftAction, CraftCostEntry } from '$lib/shared/types'
```

- [x] **Step 2: Add `solveCraftCostBatch` function**

Add after the `solveCraftingCost` function (after line 67, before `solveNode`):

```typescript
export function solveCraftCostBatch(
  cache: Map<number, ItemData>,
  vendorPrices: Map<number, number>,
): Map<number, CraftCostEntry> {
  const now = Date.now()
  const memo = new Map<number, CraftingNode>()
  const results = new Map<number, CraftCostEntry>()

  for (const itemId of getAllRecipeResultIds()) {
    const recipes = getRecipesByResult(itemId)
    if (recipes.every(r => r.companyCraft ?? false)) continue

    const node = solveNode(itemId, 1, cache, vendorPrices, undefined, memo, now, 0, Infinity)

    if (node.action === 'craft' && node.recipe) {
      results.set(itemId, {
        itemId,
        recipeId: node.recipe.recipeId,
        job: node.recipe.job,
        level: node.recipe.level,
        craftCost: node.unitCost,
        confidence: node.confidence,
      })
    }
  }

  return results
}
```

Note: We pass `Infinity` as `maxDepth` since recipes form a DAG. The `solveNode` function's `depth < maxDepth` guard will always be true, so every node gets fully evaluated and memoized.

- [x] **Step 3: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add src/lib/server/crafting.ts
git commit -m "feat(server): add solveCraftCostBatch function

Ref: ENG-69"
```

---

### Task 5: Test `solveCraftCostBatch()`

**Files:**
- Modify: `tests/server/crafting.test.ts`

- [x] **Step 1: Add import**

Update the dynamic import in `beforeAll` to also import `solveCraftCostBatch`:

```typescript
let solveCraftCostBatch: typeof import('$lib/server/crafting').solveCraftCostBatch
```

And in the `beforeAll`:
```typescript
solveCraftCostBatch = mod.solveCraftCostBatch
```

- [x] **Step 2: Write batch tests**

Add a new `describe('solveCraftCostBatch', ...)` block after the existing `describe('solveCraftingCost', ...)`:

```typescript
describe('solveCraftCostBatch', () => {
  test('returns CraftCostEntry for each craftable item', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(100)])],
      [12, itemData(12, [listing(200)])],
      [200, itemData(200, [listing(250)])],
      [13, itemData(13, [listing(100)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())

    // Item 100: craft at 525 (recipe 1)
    const entry100 = results.get(100)!
    expect(entry100).toBeDefined()
    expect(entry100.recipeId).toBe(1)
    expect(entry100.craftCost).toBe(525)
    expect(entry100.job).toBe(8)
    expect(entry100.level).toBe(50)

    // Item 200: craft at 210 (yields 3)
    const entry200 = results.get(200)!
    expect(entry200).toBeDefined()
    expect(entry200.craftCost).toBe(210)
  })

  test('excludes items where buy is cheaper than craft', () => {
    // All ingredients very expensive, but result item very cheap on market
    const cache = new Map([
      [100, itemData(100, [listing(10)])],  // very cheap to buy
      [10, itemData(10, [listing(500)])],
      [11, itemData(11, [listing(500)])],
      [12, itemData(12, [listing(500)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())

    // Item 100: buy at 10.5 is cheaper than any recipe → action='buy', no entry
    expect(results.has(100)).toBe(false)
  })

  test('excludes companyCraft-only items', () => {
    const cache = new Map([
      [600, itemData(600, [listing(100)])],
      [10, itemData(10, [listing(50)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())

    // Item 600 only has companyCraft recipe
    expect(results.has(600)).toBe(false)
  })

  test('shared memo: diamond dependency solved once', () => {
    const cache = new Map([
      [400, itemData(400, [listing(2000)])],
      [401, itemData(401, [listing(300)])],
      [402, itemData(402, [listing(400)])],
      [500, itemData(500, [listing(100)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())

    // Items 400, 401, 402 all craftable
    // 401: craft 2×105=210 < buy 315
    // 402: craft 3×105=315 < buy 420
    // 400: craft 210+315=525 < buy 2100
    expect(results.get(400)!.craftCost).toBe(525)
    expect(results.get(401)!.craftCost).toBeCloseTo(210)
    expect(results.get(402)!.craftCost).toBeCloseTo(315)
  })

  test('no depth cap: deep DAG fully resolved', () => {
    const cache = new Map([
      [700, itemData(700, [listing(1000)])],
      [701, itemData(701, [listing(500)])],
      [702, itemData(702, [listing(300)])],
      [10, itemData(10, [listing(100)])],
    ])
    const results = solveCraftCostBatch(cache, new Map())

    // 702: craft 1×105=105 < buy 315 → craft at 105
    // 701: craft 1×105=105 < buy 525 → craft at 105
    // 700: craft 1×105=105 < buy 1050 → craft at 105
    expect(results.get(702)!.craftCost).toBeCloseTo(105)
    expect(results.get(701)!.craftCost).toBeCloseTo(105)
    expect(results.get(700)!.craftCost).toBeCloseTo(105)
  })

  test('uses vendor prices when cheaper', () => {
    const cache = new Map([
      [100, itemData(100, [listing(600)])],
      [10, itemData(10, [listing(100)])],
      [11, itemData(11, [listing(200)])],
      [12, itemData(12, [listing(200)])],
    ])
    const vendors = new Map([[11, 80]])
    const results = solveCraftCostBatch(cache, vendors)

    // Recipe 1: 3×105 + 2×80 = 315+160 = 475
    expect(results.get(100)!.craftCost).toBe(475)
  })
})
```

- [x] **Step 3: Run tests to verify they pass**

Run: `bun run test -- tests/server/crafting.test.ts`
Expected: All tests PASS

- [x] **Step 4: Commit**

```bash
git add tests/server/crafting.test.ts
git commit -m "test(server): add solveCraftCostBatch tests

Ref: ENG-69"
```

---

### Task 6: Integrate batch solver into scanner

**Files:**
- Modify: `src/lib/server/scanner.ts`

- [x] **Step 1: Add imports**

Add to the imports at the top of `scanner.ts`:

```typescript
import { solveCraftCostBatch } from './crafting.ts'
import { getAllItems, getVendorPrices, setCraftCosts } from './cache.ts'
```

Note: `getAllItems` and `getVendorPrices` may already be partially imported. Merge with existing imports from `./cache.ts`. The existing import is:
```typescript
import { setItem, setNameMap, setScanMeta, getScanMeta, setScanProgress } from './cache.ts'
```
Update it to:
```typescript
import { setItem, setNameMap, setScanMeta, getScanMeta, setScanProgress, getAllItems, getVendorPrices, setCraftCosts } from './cache.ts'
```

- [x] **Step 2: Add batch call to `runScanCycle`**

Add after the `console.log(\`[scanner] Scan complete: ...\`)` line at the end of `runScanCycle()` (line 108):

```typescript
  const batchStart = Date.now()
  const craftCosts = solveCraftCostBatch(getAllItems(), getVendorPrices())
  setCraftCosts(craftCosts)
  const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1)
  console.log(`[scanner] Craft cost batch: ${craftCosts.size} items in ${batchElapsed}s`)
```

- [x] **Step 3: Add batch call to `runScanCyclePerWorld`**

Add after the `console.log(\`[scanner] Scan complete: ...\`)` line at the end of `runScanCyclePerWorld()` (line 204):

```typescript
  const batchStart = Date.now()
  const craftCosts = solveCraftCostBatch(getAllItems(), getVendorPrices())
  setCraftCosts(craftCosts)
  const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1)
  console.log(`[scanner] Craft cost batch: ${craftCosts.size} items in ${batchElapsed}s`)
```

- [x] **Step 4: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: No errors

- [x] **Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests PASS

- [x] **Step 6: Commit**

```bash
git add src/lib/server/scanner.ts
git commit -m "feat(server): run craft cost batch after each scan cycle

Ref: ENG-69"
```

---

### Task 7: Seed craft costs in fixture mode

**Files:**
- Modify: `src/lib/server/fixtures/seed.ts`
- Modify: `tests/server/fixtures.test.ts`

- [x] **Step 1: Write the failing test**

Add a new test to `tests/server/fixtures.test.ts`:

```typescript
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
```

Add `getCraftCosts` to the import from `$lib/server/cache`:
```typescript
import { getAllItems, getNameMap, isCacheReady, getScanMeta, getCraftCosts } from '$lib/server/cache'
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/server/fixtures.test.ts`
Expected: FAIL — `getCraftCosts()` returns empty map after seeding

- [x] **Step 3: Update `seedFixtureData` to run batch solver**

Modify `src/lib/server/fixtures/seed.ts`. Add imports:

```typescript
import { setCraftCosts } from '$lib/server/cache'
import { solveCraftCostBatch } from '$lib/server/crafting'
```

Add after the `setScanMeta(...)` call, before the console.log:

```typescript
  const itemCache = new Map<number, ItemData>()
  for (const item of snapshot.items) {
    itemCache.set(item.itemID, item)
  }
  const craftCosts = solveCraftCostBatch(itemCache, new Map())
  setCraftCosts(craftCosts)
```

Also add the `ItemData` type import:
```typescript
import type { ItemData } from '$lib/shared/types'
```

Update the final log line to include craft costs:
```typescript
  console.log(`[fixtures] Seeded cache with ${snapshot.items.length} items, ${craftCosts.size} craft costs`)
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/server/fixtures.test.ts`
Expected: PASS

- [x] **Step 5: Run full test suite**

Run: `bun run test`
Expected: All 208+ tests PASS

- [x] **Step 6: Commit**

```bash
git add src/lib/server/fixtures/seed.ts tests/server/fixtures.test.ts
git commit -m "feat(server): seed craft cost cache in fixture mode

Ref: ENG-69"
```

---

### Task 8: Final verification

- [x] **Step 1: Run full test suite**

Run: `bun run test`
Expected: All tests PASS, including new batch tests

- [x] **Step 2: Verify fixture dev mode works**

Run: `FIXTURE_DATA=true bun run dev`
Expected: Server starts, logs show craft cost batch seeded (e.g., "[fixtures] Seeded cache with N items, M craft costs")

Kill the dev server after verifying.

- [x] **Step 3: Verify types compile cleanly**

Run: `bunx tsc --noEmit`
Expected: No errors
