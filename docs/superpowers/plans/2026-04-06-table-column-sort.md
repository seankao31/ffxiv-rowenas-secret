# Table Column Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable column headers to OpportunityTable that sort opportunities client-side, with a three-click cycle (default direction → reverse → clear).

**Architecture:** Extract pure sort logic (comparator, toggle state machine) into a testable module. Wire it into OpportunityTable.svelte with `$derived` for the sorted list and lucide icons for visual indicators. No changes to parent components, API, or types.

**Tech Stack:** Svelte 5 (`$state`, `$derived`), TypeScript, lucide-svelte, vitest

**Spec:** `docs/superpowers/specs/2026-04-06-table-column-sort-design.md`

---

## File Structure

- **Create:** `src/lib/client/sort.ts` — pure sort logic: column config, toggle state machine, comparator
- **Create:** `tests/client/sort.test.ts` — unit tests for sort logic
- **Modify:** `src/lib/components/OpportunityTable.svelte` — add sort state, derived sorted list, clickable headers with icons

---

### Task 1: Sort toggle state machine

The toggle function determines new sort state from current state + clicked column. Pure function, no dependencies.

**Files:**
- Create: `tests/client/sort.test.ts`
- Create: `src/lib/client/sort.ts`

- [ ] **Step 1: Write failing tests for toggleSort**

```ts
// tests/client/sort.test.ts
import { test, expect, describe } from 'vitest'
import { toggleSort, type SortState } from '$lib/client/sort'

describe('toggleSort', () => {
  const cleared: SortState = { column: null, direction: 'desc' }

  test('clicking a column from cleared state sets it to default direction', () => {
    const result = toggleSort(cleared, 'profitPerUnit')
    expect(result).toEqual({ column: 'profitPerUnit', direction: 'desc' })
  })

  test('clicking activeCompetitorCount defaults to asc', () => {
    const result = toggleSort(cleared, 'activeCompetitorCount')
    expect(result).toEqual({ column: 'activeCompetitorCount', direction: 'asc' })
  })

  test('clicking active column in default direction reverses it', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'desc' }
    const result = toggleSort(state, 'profitPerUnit')
    expect(result).toEqual({ column: 'profitPerUnit', direction: 'asc' })
  })

  test('clicking active column in reversed direction clears sort', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'asc' }
    const result = toggleSort(state, 'profitPerUnit')
    expect(result).toEqual({ column: null, direction: 'desc' })
  })

  test('clicking a different column switches to that columns default direction', () => {
    const state: SortState = { column: 'profitPerUnit', direction: 'desc' }
    const result = toggleSort(state, 'expectedDailyProfit')
    expect(result).toEqual({ column: 'expectedDailyProfit', direction: 'desc' })
  })

  test('full three-click cycle for activeCompetitorCount (asc default)', () => {
    const s1 = toggleSort(cleared, 'activeCompetitorCount')
    expect(s1).toEqual({ column: 'activeCompetitorCount', direction: 'asc' })

    const s2 = toggleSort(s1, 'activeCompetitorCount')
    expect(s2).toEqual({ column: 'activeCompetitorCount', direction: 'desc' })

    const s3 = toggleSort(s2, 'activeCompetitorCount')
    expect(s3).toEqual({ column: null, direction: 'desc' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/client/sort.test.ts`
Expected: FAIL — module `$lib/client/sort` does not exist

- [ ] **Step 3: Implement toggleSort**

```ts
// src/lib/client/sort.ts
import type { Opportunity } from '$lib/shared/types.ts'

export type SortColumn = 'profitPerUnit' | 'activeCompetitorCount' | 'fairShareVelocity' | 'expectedDailyProfit'
export type SortDirection = 'asc' | 'desc'
export type SortState = { column: SortColumn | null; direction: SortDirection }

const defaultDirections: Record<SortColumn, SortDirection> = {
  profitPerUnit: 'desc',
  activeCompetitorCount: 'asc',
  fairShareVelocity: 'desc',
  expectedDailyProfit: 'desc',
}

export function toggleSort(state: SortState, clicked: SortColumn): SortState {
  if (state.column !== clicked) {
    return { column: clicked, direction: defaultDirections[clicked] }
  }
  if (state.direction === defaultDirections[clicked]) {
    const reversed: SortDirection = state.direction === 'desc' ? 'asc' : 'desc'
    return { column: clicked, direction: reversed }
  }
  return { column: null, direction: 'desc' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/client/sort.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/sort.ts tests/client/sort.test.ts
git commit -m "feat(sort): add toggle state machine with tests"
```

---

### Task 2: Sort comparator

The comparator sorts an array of Opportunities by a given column and direction, with score as tiebreaker.

**Files:**
- Modify: `tests/client/sort.test.ts`
- Modify: `src/lib/client/sort.ts`

- [ ] **Step 1: Write failing tests for sortOpportunities**

Append to `tests/client/sort.test.ts`. Update the import at top of file to include `sortOpportunities`:

```ts
import { toggleSort, sortOpportunities, type SortState } from '$lib/client/sort'
```

Then append after the `toggleSort` describe block:

```ts
import type { Opportunity } from '$lib/shared/types'

// Minimal Opportunity factory — only fields the sort logic touches
function opp(overrides: Partial<Opportunity> & { score: number }): Opportunity {
  return {
    itemID: 1, itemName: '', buyPrice: 0, sellPrice: 0, listingPrice: 0,
    profitPerUnit: 0, listingProfitPerUnit: 0, sourceWorld: '', sourceWorldID: 0,
    availableUnits: 0, recommendedUnits: 0, expectedDailyProfit: 0, score: 0,
    homeDataAgeHours: 0, homeConfidence: 1, sourceDataAgeHours: 0, sourceConfidence: 1,
    activeCompetitorCount: 0, fairShareVelocity: 0,
    ...overrides,
  }
}

describe('sortOpportunities', () => {
  const items = [
    opp({ itemID: 1, profitPerUnit: 100, expectedDailyProfit: 500, activeCompetitorCount: 3, fairShareVelocity: 2.0, score: 80 }),
    opp({ itemID: 2, profitPerUnit: 300, expectedDailyProfit: 200, activeCompetitorCount: 1, fairShareVelocity: 0.5, score: 90 }),
    opp({ itemID: 3, profitPerUnit: 200, expectedDailyProfit: 200, activeCompetitorCount: 1, fairShareVelocity: 1.0, score: 70 }),
  ]

  test('returns original order when column is null', () => {
    const result = sortOpportunities(items, { column: null, direction: 'desc' })
    expect(result.map(o => o.itemID)).toEqual([1, 2, 3])
  })

  test('sorts by profitPerUnit desc', () => {
    const result = sortOpportunities(items, { column: 'profitPerUnit', direction: 'desc' })
    expect(result.map(o => o.itemID)).toEqual([2, 3, 1])
  })

  test('sorts by profitPerUnit asc', () => {
    const result = sortOpportunities(items, { column: 'profitPerUnit', direction: 'asc' })
    expect(result.map(o => o.itemID)).toEqual([1, 3, 2])
  })

  test('sorts by activeCompetitorCount asc with score tiebreaker', () => {
    // items 2 and 3 both have count=1; item 2 has higher score (90 vs 70)
    const result = sortOpportunities(items, { column: 'activeCompetitorCount', direction: 'asc' })
    expect(result.map(o => o.itemID)).toEqual([2, 3, 1])
  })

  test('sorts by expectedDailyProfit desc with score tiebreaker', () => {
    // items 2 and 3 both have 200; item 2 has higher score (90 vs 70)
    const result = sortOpportunities(items, { column: 'expectedDailyProfit', direction: 'desc' })
    expect(result.map(o => o.itemID)).toEqual([1, 2, 3])
  })

  test('does not mutate the original array', () => {
    const copy = [...items]
    sortOpportunities(items, { column: 'profitPerUnit', direction: 'desc' })
    expect(items.map(o => o.itemID)).toEqual(copy.map(o => o.itemID))
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `bun run test -- tests/client/sort.test.ts`
Expected: `sortOpportunities` tests FAIL (not exported), `toggleSort` tests still PASS

- [ ] **Step 3: Implement sortOpportunities**

Add to `src/lib/client/sort.ts`:

```ts
export function sortOpportunities(items: Opportunity[], state: SortState): Opportunity[] {
  if (state.column === null) return items
  const { column, direction } = state
  const multiplier = direction === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const diff = a[column] - b[column]
    if (diff !== 0) return diff * multiplier
    return b.score - a.score  // tiebreaker: score desc always
  })
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `bun run test -- tests/client/sort.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/sort.ts tests/client/sort.test.ts
git commit -m "feat(sort): add sort comparator with score tiebreaker"
```

---

### Task 3: Wire sorting into OpportunityTable

Add sort state, derived sorted list, clickable headers, and lucide icons to the component.

**Files:**
- Modify: `src/lib/components/OpportunityTable.svelte`

- [ ] **Step 1: Add imports and sort state**

Add to the `<script>` block in `OpportunityTable.svelte`, after existing imports:

```ts
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-svelte'
import { toggleSort, sortOpportunities, type SortState, type SortColumn } from '$lib/client/sort.ts'
```

Add after the existing `const` declarations:

```ts
let sort = $state<SortState>({ column: null, direction: 'desc' })

const sorted = $derived(sortOpportunities(opportunities, sort))

function onSort(column: SortColumn) {
  sort = toggleSort(sort, column)
}
```

- [ ] **Step 2: Add sortable header snippet**

Add after the existing `infoIcon` snippet:

```svelte
{#snippet sortIcon(column: SortColumn)}
  <button class="inline-flex items-center gap-0.5 cursor-pointer" onclick={() => onSort(column)}>
    {#if sort.column === column}
      {#if sort.direction === 'asc'}
        <ArrowUp class="inline w-3.5 h-3.5 opacity-70" />
      {:else}
        <ArrowDown class="inline w-3.5 h-3.5 opacity-70" />
      {/if}
    {:else}
      <ArrowUpDown class="inline w-3.5 h-3.5 opacity-25" />
    {/if}
  </button>
{/snippet}
```

- [ ] **Step 3: Update sortable column headers**

Replace the four sortable `<th>` elements in `<thead>`:

```svelte
<th>Profit/unit {@render sortIcon('profitPerUnit')} <span {@attach tooltip("Sell price after 5% tax, minus buy price. Second line (if shown) uses the market board listing instead.")}>{@render infoIcon()}</span></th>
```

```svelte
<th>Comp {@render sortIcon('activeCompetitorCount')} <span {@attach tooltip("Active competing listings on the home world near the expected sell price.")}>{@render infoIcon()}</span></th>
```

```svelte
<th>Vel {@render sortIcon('fairShareVelocity')} <span {@attach tooltip("Your fair share of daily sales: total velocity ÷ (competitors + 1). Second line shows total market velocity.")}>{@render infoIcon()}</span></th>
```

```svelte
<th>Gil/day {@render sortIcon('expectedDailyProfit')} <span {@attach tooltip("Expected daily profit: profit per unit × fair-share velocity. Second line (if shown) is an alternative source world, for comparison only — all other columns use the primary source.")}>{@render infoIcon()}</span></th>
```

- [ ] **Step 4: Replace `opportunities` with `sorted` in the render loop**

Change:
```svelte
{#each opportunities as opp (opp.itemID)}
```
To:
```svelte
{#each sorted as opp (opp.itemID)}
```

- [ ] **Step 5: Run all tests to verify nothing is broken**

Run: `bun run test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/OpportunityTable.svelte
git commit -m "feat(sort): add sortable column headers to OpportunityTable"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start dev server and verify in browser**

Run: `bun run dev`

Verify:
1. Table loads with default score order (no column highlighted)
2. Sortable columns show faint ▲▼ icon; non-sortable columns have no icon
3. Click Gil/day → rows sort by daily profit desc, arrow shows ▼
4. Click Gil/day again → rows sort asc, arrow shows ▲
5. Click Gil/day third time → returns to score order, icon returns to faint ▲▼
6. Click Comp → sorts by competitor count asc (fewest first)
7. While sorted by Comp, click Vel → switches to velocity sort
8. Existing tooltips still work on sortable columns

- [ ] **Step 2: Final commit if any visual tweaks were needed**

```bash
git add -u
git commit -m "fix(sort): visual tweaks from manual testing"
```

(Skip this step if no tweaks needed.)
