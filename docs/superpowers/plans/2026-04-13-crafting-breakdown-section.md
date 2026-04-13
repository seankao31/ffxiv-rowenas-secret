# Crafting Breakdown Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Final review includes cross-model verification via codex-review-gate.

**Goal:** Add a Crafting tab to the `/item/[id]` page showing cost breakdown, recursive recipe tree, and per-node confidence indicators for craftable items.

**Architecture:** Tabbed layout on the item detail page (Market | Crafting). Crafting tab fetches from `GET /api/craft/[id]` client-side, renders a summary card, recursive tree, and confidence footer. Two new Svelte components: `CraftingBreakdown.svelte` (top-level orchestrator) and `CraftingTreeNode.svelte` (recursive node renderer). Server load function extended to expose `hasRecipe` boolean.

**Tech Stack:** SvelteKit, Svelte 5 (runes), daisyUI 5, Tailwind CSS 4, TypeScript, Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-04-13-crafting-breakdown-section-design.md`
**Mockup:** `docs/superpowers/specs/2026-04-13-crafting-breakdown-mockup.png`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/routes/item/[id]/+page.server.ts` | Add `hasRecipe` to load return |
| Modify | `src/routes/item/[id]/+page.svelte` | Add tab bar, conditionally render Market or Crafting content |
| Create | `src/lib/components/CraftingBreakdown.svelte` | Top-level Crafting tab: fetch, loading/error states, summary card, confidence footer |
| Create | `src/lib/components/CraftingTreeNode.svelte` | Recursive tree node: craft card / buy-with-recipe card / leaf row |
| Create | `tests/e2e/crafting-breakdown.test.ts` | E2e tests for the crafting tab |

---

### Task 1: Extend server load to expose `hasRecipe`

**Files:**
- Modify: `src/routes/item/[id]/+page.server.ts`

- [x] **Step 1: Write the failing test**

Create `tests/server/item-page-load.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { initRecipes } from '$lib/server/recipes'
import { getRecipesByResult } from '$lib/server/recipes'

describe('getRecipesByResult for hasRecipe check', () => {
  beforeAll(async () => {
    await initRecipes()
  })

  it('returns non-empty array for a known craftable item', () => {
    // Item 2394 = Bronze Ornamental Hammer (a basic ARM recipe)
    const recipes = getRecipesByResult(2394)
    expect(recipes.length).toBeGreaterThan(0)
  })

  it('returns empty array for a non-craftable item', () => {
    // Item 5111 = Fire Crystal (raw material, no recipe)
    const recipes = getRecipesByResult(5111)
    expect(recipes).toEqual([])
  })
})
```

- [x] **Step 2: Run test to verify it passes**

Run: `bun run test tests/server/item-page-load.test.ts`
Expected: PASS — `getRecipesByResult` already exists, this confirms the function we'll use in the load function.

- [x] **Step 3: Modify the server load function**

Edit `src/routes/item/[id]/+page.server.ts`:

```typescript
import { error } from '@sveltejs/kit'
import { getNameMap, waitForNameCache } from '$lib/server/cache'
import { getRecipesByResult } from '$lib/server/recipes'

export async function load({ params }: { params: { id: string } }) {
  const parsed = Number(params.id)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    error(400, 'Invalid item ID')
  }

  await waitForNameCache()
  const twName = getNameMap().get(parsed) ?? null
  const hasRecipe = getRecipesByResult(parsed).length > 0
  return { itemID: parsed, twName, hasRecipe }
}
```

- [x] **Step 4: Run all tests to confirm no regressions**

Run: `bun run test`
Expected: All tests PASS.

- [x] **Step 5: Commit**

```bash
git add src/routes/item/[id]/+page.server.ts tests/server/item-page-load.test.ts
git commit -m "feat(server): expose hasRecipe in item detail page load

Ref: ENG-66"
```

---

### Task 2: Add tab bar to item detail page

**Files:**
- Modify: `src/routes/item/[id]/+page.svelte`

- [x] **Step 1: Write the failing e2e test for tabs**

Create `tests/e2e/crafting-breakdown.test.ts` with the tab structure tests only:

```typescript
import { test, expect, type Page } from '@playwright/test'

const CRAFTABLE_ITEM_ID = 2394  // Bronze Ornamental Hammer (has recipe)
const RAW_ITEM_ID = 5111        // Fire Crystal (no recipe)

const XIVAPI_RESPONSE = {
  rows: [{
    row_id: CRAFTABLE_ITEM_ID,
    fields: {
      Name: 'Bronze Ornamental Hammer',
      Icon: { id: 0, path: '/i/052000/052653.tex', path_hr1: '/i/052000/052653_hr1.tex' },
    },
  }],
}

async function mockExternalApis(page: Page) {
  await page.route('**/v2.xivapi.com/api/sheet/Item**', route =>
    route.fulfill({ json: XIVAPI_RESPONSE }),
  )
  await page.route('**/v2.xivapi.com/api/asset**', route =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
        'Nl7BcQAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  )
  await page.route('**/universalis.app/api/v2/**', route =>
    route.fulfill({ json: { listings: [] } }),
  )
}

test.describe('Item detail page — tabs', () => {
  test('craftable item shows enabled Market and Crafting tabs', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}`)
    const marketTab = page.locator('[role="tab"]', { hasText: 'Market' })
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await expect(marketTab).toBeVisible()
    await expect(craftingTab).toBeVisible()
    await expect(craftingTab).toBeEnabled()
  })

  test('non-craftable item shows disabled Crafting tab', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${RAW_ITEM_ID}`)
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await expect(craftingTab).toBeVisible()
    await expect(craftingTab).toBeDisabled()
  })

  test('Market tab is selected by default', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}`)
    const marketTab = page.locator('[role="tab"]', { hasText: 'Market' })
    await expect(marketTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('h2', { hasText: 'Cross-World Listings' })).toBeVisible()
  })

  test('clicking Crafting tab switches view', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}`)
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await craftingTab.click()
    await expect(craftingTab).toHaveAttribute('aria-selected', 'true')
    // Market content should be hidden
    await expect(page.locator('h2', { hasText: 'Cross-World Listings' })).not.toBeVisible()
  })

  test('tab state persists in URL', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}?tab=crafting`)
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await expect(craftingTab).toHaveAttribute('aria-selected', 'true')
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx playwright test tests/e2e/crafting-breakdown.test.ts`
Expected: FAIL — no tab elements exist yet.

- [x] **Step 3: Implement tab bar in the page**

Edit `src/routes/item/[id]/+page.svelte`. Replace the entire file:

```svelte
<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { fetchItemMetadata, getIconUrl, getEnglishName, subscribe } from '$lib/client/xivapi.ts'
  import ListingsTable from '$lib/components/ListingsTable.svelte'

  let { data } = $props()

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  $effect(() => {
    fetchItemMetadata([data.itemID])
  })

  const iconUrl = $derived.by(() => { void nameGeneration; return getIconUrl(data.itemID) })
  const enName = $derived.by(() => { void nameGeneration; return getEnglishName(data.itemID) ?? null })
  const primaryName = $derived(data.twName ?? enName ?? `Item #${data.itemID}`)
  const secondaryName = $derived(data.twName ? enName : null)

  const activeTab = $derived($page.url.searchParams.get('tab') ?? 'market')

  function selectTab(tab: string) {
    const url = new URL($page.url)
    if (tab === 'market') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    goto(url.toString(), { replaceState: true, noScroll: true })
  }
</script>

<!-- Item Header -->
<div class="flex items-center gap-3 py-4 shrink-0">
  {#if iconUrl}
    <img src={iconUrl} alt="" width="40" height="40" class="flex-shrink-0"
      onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
  {:else}
    <div class="skeleton h-10 w-10 flex-shrink-0"></div>
  {/if}

  <div class="flex items-baseline gap-2">
    <h1 class="text-lg font-bold">{primaryName}</h1>
    {#if secondaryName}
      <span class="text-sm text-base-content/50">{secondaryName}</span>
    {/if}
    <span class="badge badge-soft">{data.itemID}</span>
  </div>
</div>

<!-- Tab Bar -->
<div class="flex gap-1 border-b border-base-300 mb-4 shrink-0" role="tablist">
  <button
    role="tab"
    aria-selected={activeTab === 'market'}
    class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
      {activeTab === 'market'
        ? 'border-accent text-accent'
        : 'border-transparent text-base-content/50 hover:text-base-content/80'}"
    onclick={() => selectTab('market')}
  >
    Market
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'crafting'}
    disabled={!data.hasRecipe}
    class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
      {activeTab === 'crafting'
        ? 'border-accent text-accent'
        : data.hasRecipe
          ? 'border-transparent text-base-content/50 hover:text-base-content/80'
          : 'border-transparent text-base-content/20 cursor-not-allowed'}"
    onclick={() => selectTab('crafting')}
  >
    Crafting
  </button>
</div>

<!-- Tab Content -->
{#if activeTab === 'market'}
  <!-- Listings | History -->
  <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
    <div class="card bg-base-200 min-h-0 flex flex-col">
      <div class="card-body flex flex-col min-h-0">
        <h2 class="card-title shrink-0">Cross-World Listings</h2>
        <ListingsTable itemId={data.itemID} />
      </div>
    </div>

    <div class="card bg-base-200">
      <div class="card-body">
        <h2 class="card-title">Sale History</h2>
        <div class="skeleton h-4 w-full"></div>
        <div class="skeleton h-4 w-3/4"></div>
        <div class="skeleton h-4 w-5/6"></div>
      </div>
    </div>
  </div>

  <!-- Price Statistics -->
  <div class="card bg-base-200 mt-4 shrink-0">
    <div class="card-body">
      <h2 class="card-title">Price Statistics</h2>
      <div class="skeleton h-4 w-full"></div>
      <div class="skeleton h-4 w-2/3"></div>
      <div class="skeleton h-4 w-3/4"></div>
    </div>
  </div>
{:else if activeTab === 'crafting'}
  <p class="text-base-content/50">Crafting breakdown coming soon...</p>
{/if}
```

- [x] **Step 4: Run e2e tests to verify tabs work**

Run: `bunx playwright test tests/e2e/crafting-breakdown.test.ts`
Expected: All tab tests PASS.

- [x] **Step 5: Run existing item-detail e2e tests to check for regressions**

Run: `bunx playwright test tests/e2e/item-detail.test.ts`
Expected: All PASS — existing tests navigate to the page with Market as default tab, so content should be unchanged.

- [x] **Step 6: Commit**

```bash
git add src/routes/item/[id]/+page.svelte tests/e2e/crafting-breakdown.test.ts
git commit -m "feat(ui): add Market/Crafting tab bar to item detail page

Ref: ENG-66"
```

---

### Task 3: Create CraftingTreeNode component

**Files:**
- Create: `src/lib/components/CraftingTreeNode.svelte`

- [x] **Step 1: Write the failing e2e test for tree nodes**

Add to `tests/e2e/crafting-breakdown.test.ts`:

```typescript
const CRAFT_API_RESPONSE = {
  root: {
    itemId: CRAFTABLE_ITEM_ID,
    amount: 1,
    action: 'craft',
    unitCost: 320,
    totalCost: 320,
    confidence: 0.92,
    recipe: {
      recipeId: 100,
      job: 10,
      level: 5,
      yields: 1,
      ingredients: [
        {
          itemId: 5056,
          amount: 3,
          action: 'buy',
          unitCost: 50,
          totalCost: 150,
          confidence: 0.88,
          marketPrice: 50,
          vendorPrice: null,
          craftCost: 200,
          marketWorld: '利維坦',
          recipe: {
            recipeId: 101,
            job: 10,
            level: 3,
            yields: 1,
            ingredients: [
              {
                itemId: 5111,
                amount: 2,
                action: 'vendor',
                unitCost: 5,
                totalCost: 10,
                confidence: 1.0,
                marketPrice: null,
                vendorPrice: 5,
                craftCost: null,
                marketWorld: null,
              },
            ],
          },
        },
        {
          itemId: 5111,
          amount: 4,
          action: 'vendor',
          unitCost: 5,
          totalCost: 20,
          confidence: 1.0,
          marketPrice: null,
          vendorPrice: 5,
          craftCost: null,
          marketWorld: null,
        },
      ],
    },
    marketPrice: 500,
    vendorPrice: null,
    craftCost: 320,
    marketWorld: '伊弗利特',
  },
  totalCost: 320,
  confidence: 0.88,
  recommendation: 'craft',
  cheapestListing: { price: 500, world: '伊弗利特' },
  realisticSellPrice: null,
  profitVsBuy: null,
  profitVsSell: null,
}

async function mockCraftApi(page: Page) {
  await page.route(`**/api/craft/${CRAFTABLE_ITEM_ID}`, route =>
    route.fulfill({ json: CRAFT_API_RESPONSE }),
  )
}

test.describe('Item detail page — crafting breakdown', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page)
    await mockCraftApi(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}?tab=crafting`)
  })

  test('shows recommendation in summary card', async ({ page }) => {
    await expect(page.locator('text=Recommendation: Craft')).toBeVisible()
  })

  test('shows craft cost and buy cheapest in summary', async ({ page }) => {
    await expect(page.locator('text=320')).toBeVisible()
    await expect(page.locator('text=500')).toBeVisible()
  })

  test('shows root node as craft with collapse arrow', async ({ page }) => {
    const rootNode = page.locator('[data-testid="craft-node"]').first()
    await expect(rootNode).toBeVisible()
    await expect(rootNode.locator('text=▼')).toBeVisible()
  })

  test('shows vendor leaf nodes without collapse arrow', async ({ page }) => {
    const vendorBadges = page.locator('text=vendor')
    await expect(vendorBadges.first()).toBeVisible()
  })

  test('buy node with recipe shows expand arrow', async ({ page }) => {
    const buyNode = page.locator('[data-testid="buy-recipe-node"]')
    await expect(buyNode).toBeVisible()
    await expect(buyNode.locator('text=▶')).toBeVisible()
  })

  test('clicking buy-with-recipe node expands it', async ({ page }) => {
    const buyNode = page.locator('[data-testid="buy-recipe-node"]')
    await buyNode.locator('text=▶').click()
    await expect(buyNode.locator('text=▼')).toBeVisible()
    // Should now show the vendor child
    const children = buyNode.locator('[data-testid="vendor-leaf"]')
    await expect(children).toBeVisible()
  })

  test('clicking expanded craft node collapses it', async ({ page }) => {
    const rootNode = page.locator('[data-testid="craft-node"]').first()
    await rootNode.locator('text=▼').click()
    await expect(rootNode.locator('text=▶')).toBeVisible()
  })

  test('shows confidence dots on market-priced nodes', async ({ page }) => {
    const dots = page.locator('[data-testid="confidence-dot"]')
    // Root (craft, market-based) + buy node = 2 dots; vendor nodes have no dot
    await expect(dots).toHaveCount(2)
  })

  test('shows overall confidence footer', async ({ page }) => {
    await expect(page.locator('text=Overall Confidence')).toBeVisible()
    await expect(page.locator('text=88%')).toBeVisible()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx playwright test tests/e2e/crafting-breakdown.test.ts`
Expected: FAIL — CraftingTreeNode component doesn't exist yet.

- [x] **Step 3: Create the CraftingTreeNode component**

Create `src/lib/components/CraftingTreeNode.svelte`:

```svelte
<script lang="ts">
  import type { CraftingNode } from '$lib/shared/types'
  import { getIconUrl, fetchItemMetadata } from '$lib/client/xivapi.ts'

  let { node, depth = 0 }: { node: CraftingNode; depth?: number } = $props()

  const hasRecipe = $derived(!!node.recipe)
  const isExpanded = $state(node.action === 'craft')
  let expanded = $state(node.action === 'craft')

  const isCraftNode = $derived(node.action === 'craft' && hasRecipe)
  const isBuyWithRecipe = $derived(node.action !== 'craft' && hasRecipe)
  const isLeaf = $derived(!hasRecipe)
  const isVendor = $derived(node.action === 'vendor')

  const showConfidenceDot = $derived(!isVendor)
  const confidenceColor = $derived.by(() => {
    if (node.confidence >= 0.85) return '#5b5'
    if (node.confidence >= 0.60) return '#cb3'
    if (node.confidence >= 0.25) return '#e83'
    return '#d44'
  })

  const alternativeText = $derived.by(() => {
    if (node.action === 'craft' && node.marketPrice != null) {
      const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
      return `buy ${node.marketPrice.toLocaleString()}${world}`
    }
    if (node.action === 'buy' && node.craftCost != null) {
      return `craft ${node.craftCost.toLocaleString()}`
    }
    if (node.action === 'vendor' && node.marketPrice != null) {
      const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
      return `buy ${node.marketPrice.toLocaleString()}${world}`
    }
    return null
  })

  const actionBadgeText = $derived.by(() => {
    if (node.action === 'craft') return 'craft'
    if (node.action === 'vendor') return 'vendor'
    const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
    return `buy${world}`
  })

  $effect(() => {
    fetchItemMetadata([node.itemId])
  })

  const iconUrl = $derived(getIconUrl(node.itemId))

  function toggleExpand() {
    expanded = !expanded
  }

  function formatGil(n: number): string {
    return n.toLocaleString()
  }
</script>

{#if isCraftNode || isBuyWithRecipe}
  <!-- Bordered card node (craft or buy-with-recipe) -->
  <div
    class="mb-1.5 border border-base-300 rounded-lg p-2 {isCraftNode ? 'bg-success/[0.04]' : 'bg-primary/[0.04]'}"
    data-testid={isCraftNode ? 'craft-node' : 'buy-recipe-node'}
  >
    <div class="flex items-center gap-2">
      <button
        class="text-xs font-bold w-3.5 shrink-0 {isCraftNode ? 'text-success' : 'text-primary'}"
        onclick={toggleExpand}
      >
        {expanded ? '▼' : '▶'}
      </button>
      {#if iconUrl}
        <img src={iconUrl} alt="" class="w-5 h-5 rounded-sm shrink-0"
          onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      {:else}
        <div class="w-5 h-5 rounded-sm bg-base-300 shrink-0"></div>
      {/if}
      <a href="/item/{node.itemId}" class="text-primary text-xs hover:underline flex-1 min-w-0 truncate">
        {node.itemId}{#if node.amount > 1}<span class="text-base-content/40"> ×{node.amount}</span>{/if}
      </a>
      <span class="text-[9px] px-1.5 py-px rounded {isCraftNode ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'}">
        {actionBadgeText}
      </span>
      {#if alternativeText}
        <span class="text-base-content/40 text-[9px]">{alternativeText}</span>
      {/if}
      {#if showConfidenceDot}
        <span
          class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style="background:{confidenceColor}"
          data-testid="confidence-dot"
        ></span>
      {/if}
      <span class="text-xs font-bold min-w-[50px] text-right">{formatGil(node.totalCost)}</span>
    </div>

    {#if expanded && node.recipe}
      <div class="ml-3.5 lg:ml-4 mt-1.5 border-l border-base-300 pl-2.5">
        {#each node.recipe.ingredients as child}
          <svelte:self node={child} depth={depth + 1} />
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <!-- Leaf node (buy or vendor, no recipe) -->
  <div
    class="mb-0.5 flex items-center gap-2 py-1 px-1"
    data-testid={isVendor ? 'vendor-leaf' : 'buy-leaf'}
  >
    <span class="w-3.5 shrink-0"></span>
    {#if iconUrl}
      <img src={iconUrl} alt="" class="w-[18px] h-[18px] rounded-sm shrink-0"
        onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
    {:else}
      <div class="w-[18px] h-[18px] rounded-sm bg-base-300 shrink-0"></div>
    {/if}
    {#if isVendor}
      <span class="text-base-content/80 text-xs flex-1 min-w-0 truncate">
        {node.itemId}{#if node.amount > 1}<span class="text-base-content/40"> ×{node.amount}</span>{/if}
      </span>
    {:else}
      <a href="/item/{node.itemId}" class="text-primary text-xs hover:underline flex-1 min-w-0 truncate">
        {node.itemId}{#if node.amount > 1}<span class="text-base-content/40"> ×{node.amount}</span>{/if}
      </a>
    {/if}
    <span class="text-[9px] px-1.5 py-px rounded {isVendor ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'}">
      {actionBadgeText}
    </span>
    {#if showConfidenceDot}
      <span
        class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style="background:{confidenceColor}"
        data-testid="confidence-dot"
      ></span>
    {/if}
    <span class="text-xs font-bold min-w-[50px] text-right">{formatGil(node.totalCost)}</span>
  </div>
{/if}
```

**Note:** The component displays `node.itemId` as the item name. This is a temporary placeholder — item names come from the XIVAPI cache populated by `fetchItemMetadata`. The `$effect` triggers the fetch, and a future step can add `nameGeneration` reactivity if needed. For now, the parent component (`CraftingBreakdown`) will handle name resolution by batch-fetching all item IDs in the tree.

- [x] **Step 4: Commit (component not yet wired up — tests still fail)**

```bash
git add src/lib/components/CraftingTreeNode.svelte
git commit -m "feat(ui): add CraftingTreeNode recursive component

Ref: ENG-66"
```

---

### Task 4: Create CraftingBreakdown component

**Files:**
- Create: `src/lib/components/CraftingBreakdown.svelte`

- [x] **Step 1: Create the CraftingBreakdown component**

Create `src/lib/components/CraftingBreakdown.svelte`:

```svelte
<script lang="ts">
  import type { CraftingResult, CraftingNode as CraftingNodeType } from '$lib/shared/types'
  import { fetchItemMetadata, subscribe } from '$lib/client/xivapi.ts'
  import CraftingTreeNode from './CraftingTreeNode.svelte'

  let { itemId }: { itemId: number } = $props()

  let result = $state<(CraftingResult & { recommendation: 'craft' | 'buy' }) | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let cacheNotReady = $state(false)

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  function collectItemIds(node: CraftingNodeType): number[] {
    const ids = [node.itemId]
    if (node.recipe) {
      for (const child of node.recipe.ingredients) {
        ids.push(...collectItemIds(child))
      }
    }
    return ids
  }

  async function fetchCraftData() {
    loading = true
    error = null
    cacheNotReady = false
    try {
      const res = await fetch(`/api/craft/${itemId}`)
      if (res.status === 202) {
        cacheNotReady = true
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed with status ${res.status}`)
      }
      const data = await res.json()
      result = data
      const ids = collectItemIds(data.root)
      fetchItemMetadata([...new Set(ids)])
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to load crafting data'
    } finally {
      loading = false
    }
  }

  $effect(() => { fetchCraftData() })

  const confidencePercent = $derived(result ? Math.round(result.confidence * 100) : 0)
  const confidenceLabel = $derived.by(() => {
    if (!result) return ''
    if (result.confidence >= 0.85) return 'High'
    if (result.confidence >= 0.60) return 'Medium'
    if (result.confidence >= 0.25) return 'Low'
    return 'Stale'
  })
  const confidenceColor = $derived.by(() => {
    if (!result) return '#5b5'
    if (result.confidence >= 0.85) return '#5b5'
    if (result.confidence >= 0.60) return '#cb3'
    if (result.confidence >= 0.25) return '#e83'
    return '#d44'
  })

  const isCraftRecommended = $derived(result?.recommendation === 'craft')
  const savings = $derived.by(() => {
    if (!result?.cheapestListing) return null
    return result.cheapestListing.price - result.totalCost
  })

  function formatGil(n: number): string {
    return n.toLocaleString()
  }
</script>

<div class="flex justify-center">
  <div class="w-full max-w-[520px]">
    {#if loading}
      <!-- Skeleton loading state -->
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <div class="skeleton h-5 w-48 mb-3"></div>
          <div class="flex gap-4">
            <div class="skeleton h-10 w-24"></div>
            <div class="skeleton h-10 w-24"></div>
            <div class="skeleton h-10 w-24"></div>
          </div>
        </div>
      </div>
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <div class="skeleton h-4 w-32 mb-3"></div>
          {#each { length: 4 } as _}
            <div class="skeleton h-8 w-full mb-1.5"></div>
          {/each}
        </div>
      </div>
    {:else if cacheNotReady}
      <div class="card bg-base-200">
        <div class="card-body items-center text-center p-8">
          <span class="loading loading-spinner loading-md"></span>
          <p class="text-base-content/50 text-sm mt-2">Market data still loading...</p>
          <button class="btn btn-sm btn-ghost mt-2" onclick={fetchCraftData}>Retry</button>
        </div>
      </div>
    {:else if error}
      <div class="card bg-base-200">
        <div class="card-body items-center text-center p-8">
          <p class="text-error text-sm">{error}</p>
          <button class="btn btn-sm btn-ghost mt-2" onclick={fetchCraftData}>Retry</button>
        </div>
      </div>
    {:else if result}
      <!-- Summary Card -->
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold {isCraftRecommended ? 'text-success' : 'text-primary'}">
              ⚒ Recommendation: {isCraftRecommended ? 'Craft' : 'Buy'}
            </span>
            <span class="text-xs px-2.5 py-0.5 rounded-full"
              style="background:{confidenceColor}20;color:{confidenceColor}">
              {confidencePercent}% confidence
            </span>
          </div>
          <div class="flex flex-wrap gap-5 text-xs items-baseline">
            <div>
              <span class="text-base-content/50">Craft cost</span><br>
              <span class="font-bold text-base {isCraftRecommended ? 'text-success' : ''}">{formatGil(result.totalCost)}</span>
            </div>
            <span class="text-base-content/30 text-sm">vs</span>
            {#if result.cheapestListing}
              <div>
                <span class="text-base-content/50">Buy cheapest</span><br>
                <span class="font-bold text-base {!isCraftRecommended ? 'text-primary' : ''}">{formatGil(result.cheapestListing.price)}</span>
                <span class="text-base-content/40 text-[10px]">@ {result.cheapestListing.world}</span>
              </div>
            {:else}
              <div>
                <span class="text-base-content/50">Buy cheapest</span><br>
                <span class="text-base-content/30 text-base">N/A</span>
              </div>
            {/if}
            {#if isCraftRecommended && savings != null && savings > 0}
              <div class="ml-auto">
                <span class="text-base-content/50">You save</span><br>
                <span class="font-bold text-base text-success">{formatGil(savings)}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Recipe Tree -->
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <h2 class="font-bold text-sm mb-3">Recipe Tree</h2>
          <CraftingTreeNode node={result.root} />
        </div>
      </div>

      <!-- Confidence Footer -->
      <div class="card bg-base-200">
        <div class="card-body p-3">
          <div class="flex justify-between items-center text-xs mb-1.5">
            <span class="text-base-content/50">Overall Confidence</span>
            <span class="font-bold" style="color:{confidenceColor}">{confidencePercent}% — {confidenceLabel}</span>
          </div>
          <div class="bg-base-300 rounded-sm h-1">
            <div class="rounded-sm h-1 transition-all" style="background:{confidenceColor};width:{confidencePercent}%"></div>
          </div>
          <div class="flex gap-3 mt-1.5 text-[9px] text-base-content/30">
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#5b5"></span>High</span>
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#cb3"></span>Medium</span>
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#e83"></span>Low</span>
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#d44"></span>Stale</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
```

- [x] **Step 2: Commit**

```bash
git add src/lib/components/CraftingBreakdown.svelte
git commit -m "feat(ui): add CraftingBreakdown component with summary, tree, confidence

Ref: ENG-66"
```

---

### Task 5: Wire CraftingBreakdown into the page and pass e2e tests

**Files:**
- Modify: `src/routes/item/[id]/+page.svelte`

- [x] **Step 1: Import and render CraftingBreakdown in the Crafting tab**

Edit `src/routes/item/[id]/+page.svelte`. Add the import:

```svelte
import CraftingBreakdown from '$lib/components/CraftingBreakdown.svelte'
```

Replace the placeholder in the crafting tab section:

```svelte
{:else if activeTab === 'crafting'}
  <CraftingBreakdown itemId={data.itemID} />
{/if}
```

- [x] **Step 2: Run all crafting breakdown e2e tests**

Run: `bunx playwright test tests/e2e/crafting-breakdown.test.ts`
Expected: All PASS.

- [x] **Step 3: Run full e2e suite for regressions**

Run: `bunx playwright test`
Expected: All PASS.

- [x] **Step 4: Commit**

```bash
git add src/routes/item/[id]/+page.svelte
git commit -m "feat(ui): wire CraftingBreakdown into item detail Crafting tab

Ref: ENG-66"
```

---

### Task 6: Item name resolution in tree nodes

The tree currently shows item IDs instead of names. The `CraftingBreakdown` component batch-fetches metadata via `fetchItemMetadata`, but `CraftingTreeNode` needs to reactively display the resolved names.

**Files:**
- Modify: `src/lib/components/CraftingTreeNode.svelte`

- [x] **Step 1: Add e2e test for item names in tree**

Add to the `crafting breakdown` describe block in `tests/e2e/crafting-breakdown.test.ts`:

```typescript
test('tree nodes show item names after metadata loads', async ({ page }) => {
  // XIVAPI mock returns 'Bronze Ornamental Hammer' for the root item
  // Nodes should show resolved names, not raw item IDs
  const rootNode = page.locator('[data-testid="craft-node"]').first()
  await expect(rootNode.locator('a')).toContainText('Bronze Ornamental Hammer')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx playwright test tests/e2e/crafting-breakdown.test.ts --grep "item names"`
Expected: FAIL — node shows item ID, not name.

- [x] **Step 3: Add name reactivity to CraftingTreeNode**

Edit `src/lib/components/CraftingTreeNode.svelte`. Add `nameGeneration` prop and name derivation to the script block:

```svelte
<script lang="ts">
  import type { CraftingNode } from '$lib/shared/types'
  import { getIconUrl, getEnglishName, subscribe } from '$lib/client/xivapi.ts'

  let { node, depth = 0 }: { node: CraftingNode; depth?: number } = $props()

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  const displayName = $derived.by(() => {
    void nameGeneration
    return getEnglishName(node.itemId) ?? `Item #${node.itemId}`
  })
  const iconUrl = $derived.by(() => {
    void nameGeneration
    return getIconUrl(node.itemId)
  })

  // ... rest of existing script unchanged (remove the old iconUrl derived and $effect for fetchItemMetadata)
```

Replace all occurrences of `{node.itemId}` in the template with `{displayName}` (in the `<a>` tags and `<span>` for vendor names).

- [x] **Step 4: Also update the XIVAPI mock to return data for all items in the tree**

Update the `XIVAPI_RESPONSE` in the test file to include rows for all item IDs used in `CRAFT_API_RESPONSE`:

```typescript
const XIVAPI_RESPONSE = {
  rows: [
    {
      row_id: CRAFTABLE_ITEM_ID,
      fields: {
        Name: 'Bronze Ornamental Hammer',
        Icon: { id: 0, path: '/i/052000/052653.tex', path_hr1: '/i/052000/052653_hr1.tex' },
      },
    },
    {
      row_id: 5056,
      fields: {
        Name: 'Bronze Ingot',
        Icon: { id: 0, path: '/i/020000/020801.tex', path_hr1: '/i/020000/020801_hr1.tex' },
      },
    },
    {
      row_id: 5111,
      fields: {
        Name: 'Fire Crystal',
        Icon: { id: 0, path: '/i/020000/020001.tex', path_hr1: '/i/020000/020001_hr1.tex' },
      },
    },
  ],
}
```

- [x] **Step 5: Run tests**

Run: `bunx playwright test tests/e2e/crafting-breakdown.test.ts`
Expected: All PASS.

- [x] **Step 6: Commit**

```bash
git add src/lib/components/CraftingTreeNode.svelte tests/e2e/crafting-breakdown.test.ts
git commit -m "feat(ui): resolve item names in crafting tree via XIVAPI metadata

Ref: ENG-66"
```

---

### Task 7: Visual verification and polish

**Files:**
- Possibly modify: `src/lib/components/CraftingBreakdown.svelte`, `src/lib/components/CraftingTreeNode.svelte`

- [x] **Step 1: Start the dev server with fixture data**

Run: `FIXTURE_DATA=true bun run dev`

Navigate to a craftable item's page (e.g., `/item/2394?tab=crafting`) using Playwright MCP tools.

- [x] **Step 2: Take screenshots and verify against the mockup**

Use `mcp__plugin_playwright_playwright__browser_take_screenshot` to capture the Crafting tab. Compare visually against `docs/superpowers/specs/2026-04-13-crafting-breakdown-mockup.png`.

Check:
- Summary card layout and spacing
- Tree node alignment (costs right-aligned in a column)
- Confidence dots visible and correctly colored
- Action badges have correct colors (green/blue/amber)
- Alternative text is dimmed and inline
- Expand/collapse works for craft and buy-with-recipe nodes
- Disabled Crafting tab on a non-craftable item

- [x] **Step 3: Verify mobile responsiveness**

Resize the viewport to 375px width and take a screenshot. Check:
- Summary card stacks vertically
- Tree nodes wrap gracefully
- Tree indentation is reasonable (not overflowing)
- Tab bar is full-width

- [x] **Step 4: Fix any visual issues found**

Apply CSS tweaks as needed. Run e2e tests after any changes.

- [x] **Step 5: Run full test suite**

Run: `bunx playwright test && bun run test`
Expected: All PASS.

- [x] **Step 6: Commit any polish changes**

```bash
git add -u
git commit -m "fix(ui): polish crafting breakdown layout and spacing

Ref: ENG-66"
```

- [x] **Step 7: Kill dev server**

Ensure the `FIXTURE_DATA=true bun run dev` process is terminated.

---

### Task 8: Final review

- [x] **Step 1: Run full test suite**

Run: `bun run test && bunx playwright test`
Expected: All PASS.

- [x] **Step 2: Cross-model code review via codex-review-gate**

Invoke `codex-review-gate` skill for final review of all changes on the branch.

- [x] **Step 3: Assess if adversarial review is warranted**

Given this is a self-contained UI feature with no security-sensitive changes, standard review should suffice.
