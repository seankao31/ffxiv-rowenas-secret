# ENG-48: Mobile-Responsive Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the surrounding UI mobile-friendly with a hamburger drawer for navigation, responsive controls, and a sticky first table column.

**Architecture:** Single `lg` (1024px) breakpoint using Tailwind responsive prefixes. Below 1024px: sidebar hidden, hamburger drawer for nav, stacked controls, reduced padding. Table gets sticky first column + horizontal scroll at all sizes. New `NavDrawer.svelte` component for mobile navigation overlay.

**Tech Stack:** SvelteKit, Svelte 5, Tailwind CSS v4, DaisyUI v5, Playwright (e2e tests), lucide-svelte (icons)

**Spec:** `docs/superpowers/specs/2026-04-08-mobile-responsive-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/components/NavDrawer.svelte` | Create | Slide-out mobile navigation overlay |
| `src/lib/components/TopBar.svelte` | Modify | Add hamburger button (mobile only) |
| `src/routes/+layout.svelte` | Modify | Wire drawer state, hide sidebar on mobile, responsive padding |
| `src/lib/components/ThresholdControls.svelte` | Modify | Stack controls vertically on mobile |
| `src/lib/components/StatusBar.svelte` | Modify | Responsive padding |
| `src/lib/components/OpportunityTable.svelte` | Modify | Sticky first column, horizontal scroll |
| `playwright.config.ts` | — | Unchanged (viewport set per-test to avoid running existing tests at mobile size) |
| `tests/e2e/mobile-layout.test.ts` | Create | E2E tests for mobile responsiveness |
| `tests/e2e/fixtures/opportunities.ts` | — | Existing fixture, reused |

---

### Task 1: Write failing e2e tests for mobile navigation

**Files:**
- Create: `tests/e2e/mobile-layout.test.ts`

Note: We do NOT add a mobile project to `playwright.config.ts` — that would run all existing e2e tests at mobile viewport, causing failures. Instead, each describe block sets its own viewport via `test.use()`.

- [x] **Step 1: Write failing e2e tests for mobile navigation**

Create `tests/e2e/mobile-layout.test.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'

async function mockApi(page: Page) {
  await page.route('**/api/opportunities**', async route => {
    await route.fulfill({ json: { opportunities, meta } })
  })
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
  await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
  await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
}

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('sidebar is hidden on mobile', async ({ page }) => {
    await expect(page.locator('nav')).toBeHidden()
  })

  test('hamburger button is visible on mobile', async ({ page }) => {
    await expect(page.locator('button[aria-label="Open menu"]')).toBeVisible()
  })

  test('clicking hamburger opens navigation drawer', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    await expect(page.locator('[data-testid="nav-drawer"] a')).toHaveCount(1) // Arbitrage
  })

  test('drawer closes when clicking backdrop', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    // Click the backdrop (the overlay behind the drawer panel)
    await page.locator('[data-testid="nav-drawer-backdrop"]').click()
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeHidden()
  })

  test('drawer closes on Escape key', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeHidden()
  })
})

test.describe('desktop layout unchanged', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('sidebar is visible on desktop', async ({ page }) => {
    await expect(page.locator('nav')).toBeVisible()
  })

  test('hamburger button is hidden on desktop', async ({ page }) => {
    await expect(page.locator('button[aria-label="Open menu"]')).toBeHidden()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun run test:e2e tests/e2e/mobile-layout.test.ts`

Expected: All tests fail — no hamburger button, no drawer, sidebar still visible on mobile.

- [x] **Step 3: Commit failing tests**

```bash
git add tests/e2e/mobile-layout.test.ts
git commit -m "test(ENG-48): add failing e2e tests for mobile navigation layout"
```

---

### Task 2: Create NavDrawer component

**Files:**
- Create: `src/lib/components/NavDrawer.svelte`

- [x] **Step 1: Create the NavDrawer component**

Create `src/lib/components/NavDrawer.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/state'
  import { navItems } from '$lib/client/navigation.ts'

  let { open, onclose }: {
    open: boolean
    onclose: () => void
  } = $props()

  const isActive = (id: string) => page.url.pathname.startsWith(`/${id}`)

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-testid="nav-drawer"
    class="fixed inset-0 z-40"
    onkeydown={onkeydown}
  >
    <!-- Backdrop -->
    <button
      data-testid="nav-drawer-backdrop"
      class="absolute inset-0 bg-black/50 cursor-default"
      onclick={onclose}
      aria-label="Close menu"
      tabindex="-1"
    ></button>

    <!-- Panel -->
    <nav class="absolute top-0 left-0 h-full w-[280px] bg-base-200 border-r border-base-300 flex flex-col overflow-y-auto">
      <div class="px-4 py-4 text-lg text-accent font-semibold border-b border-base-300">
        羅薇娜的商業機密
      </div>

      <div class="flex-1 pt-2">
        {#each navItems as item (item.id)}
          {@const Icon = item.icon}
          <a
            href="/{item.id}"
            onclick={onclose}
            class="flex items-center gap-3 px-4 py-3 text-sm no-underline transition-colors {isActive(item.id)
              ? 'border-l-2 border-accent bg-accent/10 text-accent'
              : 'text-base-content/60 hover:bg-base-300'}"
          >
            <Icon class="w-5 h-5 shrink-0" />
            <span>{item.label}</span>
          </a>
        {/each}
      </div>
    </nav>
  </div>
{/if}
```

Key details:
- `py-3` on nav links (vs `py-2` on desktop sidebar) for touch-friendly 44px+ tap targets
- `w-[280px]` panel width — ~72% of a 390px phone, leaves visible backdrop
- Backdrop is a `<button>` for keyboard accessibility
- `onclose` called on navigation click and Escape key
- `data-testid` attributes for Playwright tests

- [x] **Step 2: Commit NavDrawer**

```bash
git add src/lib/components/NavDrawer.svelte
git commit -m "feat(ENG-48): add NavDrawer component for mobile navigation"
```

---

### Task 3: Wire mobile layout — TopBar hamburger, hide sidebar, responsive padding

**Files:**
- Modify: `src/lib/components/TopBar.svelte`
- Modify: `src/routes/+layout.svelte`

- [x] **Step 1: Add hamburger button to TopBar**

Modify `src/lib/components/TopBar.svelte`. Add `Menu` icon import from lucide-svelte, accept an `onmenuclick` prop, and render the hamburger button:

```svelte
<script lang="ts">
  import { page } from '$app/state'
  import { Menu } from 'lucide-svelte'
  import { navItems } from '$lib/client/navigation.ts'

  let { onmenuclick }: { onmenuclick?: () => void } = $props()

  const currentTool = $derived(
    navItems.find(item => page.url.pathname.startsWith(`/${item.id}`))?.label ?? ''
  )
</script>

<header class="h-12 flex items-center justify-between px-3 lg:px-4 bg-base-200 border-b border-base-300 shrink-0">
  <div class="flex items-center gap-2">
    {#if onmenuclick}
      <button onclick={onmenuclick} class="lg:hidden p-1 -ml-1" aria-label="Open menu">
        <Menu class="w-5 h-5" />
      </button>
    {/if}
    <span class="text-lg text-accent font-semibold">羅薇娜的商業機密</span>
    <span class="hidden lg:inline text-xs text-base-content/30">{__APP_VERSION__}</span>
    <span class="hidden lg:inline text-base-content/30">/</span>
    <span class="hidden lg:inline text-base-content/70">{currentTool}</span>
  </div>
  <div class="text-base-content/40 text-sm">
  </div>
</header>
```

Changes:
- `onmenuclick` optional prop — only passed on mobile-capable layout
- Hamburger button with `lg:hidden` — disappears on desktop
- Version + tool name hidden on mobile (`hidden lg:inline`)
- Padding: `px-3 lg:px-4`

- [x] **Step 2: Modify layout to wire everything together**

Modify `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css'
  import { Heart } from 'lucide-svelte'
  import TopBar from '$lib/components/TopBar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import NavDrawer from '$lib/components/NavDrawer.svelte'
  import { loadSidebarExpanded, saveSidebarExpanded } from '$lib/client/sidebar.ts'

  let { children } = $props()

  let expanded = $state(loadSidebarExpanded())
  let drawerOpen = $state(false)

  function toggleSidebar() {
    expanded = !expanded
    saveSidebarExpanded(expanded)
  }
</script>

<div class="flex flex-col h-screen overflow-hidden">
  <TopBar onmenuclick={() => drawerOpen = true} />

  <div class="flex flex-1 min-h-0">
    <div class="hidden lg:flex">
      <Sidebar {expanded} ontoggle={toggleSidebar} />
    </div>

    <div class="flex-1 flex flex-col min-h-0">
      <div class="ad-zone w-full shrink-0"></div>

      <div class="flex-1 flex flex-col min-h-0 max-w-[1400px] w-full mx-auto px-3 lg:px-8 box-border">
        {@render children()}
      </div>
    </div>
  </div>

  <NavDrawer open={drawerOpen} onclose={() => drawerOpen = false} />

  <footer class="shrink-0 p-5 px-3 lg:px-8 text-center text-base-content/40 text-xs border-t border-base-300">
    <p class="my-1">Built with <Heart class="inline w-3.5 h-3.5 align-text-bottom text-error" fill="currentColor" /> by <a class="link link-info no-underline hover:underline" href="https://yhkao.com" target="_blank" rel="noopener">Yshan</a></p>
    <p class="my-1">Data sourced from <a class="link link-info no-underline hover:underline" href="https://universalis.app" target="_blank" rel="noopener">Universalis</a></p>
    <p class="my-1 text-base-content/30 text-[11px]">FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. © SQUARE ENIX CO., LTD. All Rights Reserved.</p>
  </footer>
</div>
```

Changes:
- Import `NavDrawer`
- `drawerOpen` state (separate from `expanded`)
- Sidebar wrapped in `<div class="hidden lg:flex">` — hidden below 1024px
- `NavDrawer` rendered with `open`/`onclose` bindings
- Content padding: `px-3 lg:px-8`
- Footer padding: `px-3 lg:px-8`
- TopBar receives `onmenuclick` to open drawer

- [x] **Step 3: Run navigation e2e tests**

Run: `bun run test:e2e tests/e2e/mobile-layout.test.ts`

Expected: All 7 tests pass (mobile: sidebar hidden, hamburger visible, drawer opens/closes; desktop: sidebar visible, hamburger hidden).

- [x] **Step 4: Run full test suite to check for regressions**

Run: `bun run test` and `bun run test:e2e`

Expected: All existing tests still pass. The desktop e2e tests in `opportunity-table.test.ts` use `Desktop Chrome` project and should be unaffected.

- [x] **Step 5: Commit**

```bash
git add src/lib/components/TopBar.svelte src/routes/+layout.svelte
git commit -m "feat(ENG-48): wire mobile layout — hamburger, drawer, hide sidebar, responsive padding"
```

---

### Task 4: Write failing test and implement responsive ThresholdControls

**Files:**
- Modify: `tests/e2e/mobile-layout.test.ts`
- Modify: `src/lib/components/ThresholdControls.svelte`

- [x] **Step 1: Add failing e2e test for stacked controls**

Append to the `'mobile layout'` describe block in `tests/e2e/mobile-layout.test.ts`:

```ts
test('threshold controls stack vertically on mobile', async ({ page }) => {
  // Open controls
  await page.click('text=Scan Parameters')
  // Each slider label should be full-width (stacked), so the container should use flex-col
  const container = page.locator('[data-testid="threshold-controls-body"]')
  await expect(container).toBeVisible()
  // Check controls are stacked: the first two labels should NOT be on the same Y line
  const labels = container.locator('label')
  const first = await labels.nth(0).boundingBox()
  const second = await labels.nth(1).boundingBox()
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  // Stacked means second label is below first, not beside it
  expect(second!.y).toBeGreaterThan(first!.y + first!.height / 2)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test:e2e tests/e2e/mobile-layout.test.ts -g "threshold controls"`

Expected: Fails — controls currently use `flex-wrap` at all sizes, and `min-w-40` may cause side-by-side layout.

- [x] **Step 3: Make ThresholdControls responsive**

Modify `src/lib/components/ThresholdControls.svelte`:

Change the expanded content container (line 33) from:
```svelte
<div class="flex flex-wrap gap-5 px-4 pt-3 pb-4">
```
to:
```svelte
<div data-testid="threshold-controls-body" class="flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:gap-5 px-3 lg:px-4 pt-3 pb-4">
```

Change each slider `<label>` from `min-w-40` to `lg:min-w-40`:
```svelte
<label class="flex flex-col gap-1 text-base-content/60 text-sm lg:min-w-40">
```

Change the header button padding (line 22) from `px-4` to `px-3 lg:px-4`:
```svelte
<button class="w-full py-2.5 px-3 lg:px-4 bg-transparent border-none text-base-content cursor-pointer text-left text-sm" onclick={() => (open = !open)}>
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test:e2e tests/e2e/mobile-layout.test.ts -g "threshold controls"`

Expected: PASS

- [x] **Step 5: Commit**

```bash
git add tests/e2e/mobile-layout.test.ts src/lib/components/ThresholdControls.svelte
git commit -m "feat(ENG-48): stack threshold controls vertically on mobile"
```

---

### Task 5: Responsive StatusBar padding

**Files:**
- Modify: `src/lib/components/StatusBar.svelte`

- [x] **Step 1: Make StatusBar padding responsive**

In `src/lib/components/StatusBar.svelte`, change all three status containers from `px-4` to `px-3 lg:px-4`:

Line 30 (very stale alert):
```svelte
<div role="alert" class="alert alert-error text-sm py-2 px-3 lg:px-4 rounded-none">
```

Line 33 (stale alert):
```svelte
<div role="alert" class="alert alert-warning text-sm py-2 px-3 lg:px-4 rounded-none">
```

Line 38 (normal status):
```svelte
<div class="py-2 px-3 lg:px-4 bg-base-200 text-base-content/60 text-sm">
```

- [x] **Step 2: Run full test suite**

Run: `bun run test` and `bun run test:e2e`

Expected: All tests pass — this is a padding-only change.

- [x] **Step 3: Commit**

```bash
git add src/lib/components/StatusBar.svelte
git commit -m "feat(ENG-48): responsive padding on StatusBar"
```

---

### Task 6: Write failing test and implement sticky first table column

**Files:**
- Modify: `tests/e2e/mobile-layout.test.ts`
- Modify: `src/lib/components/OpportunityTable.svelte`

- [x] **Step 1: Add failing e2e test for sticky column**

Append to the `'mobile layout'` describe block in `tests/e2e/mobile-layout.test.ts`:

```ts
test('item column stays visible while scrolling table horizontally', async ({ page }) => {
  const table = page.locator('table')
  const firstItemLink = table.locator('tbody tr:first-child td:first-child a')

  // Item name should be visible initially
  await expect(firstItemLink).toBeVisible()

  // Scroll the table container to the right
  const container = table.locator('..')
  await container.evaluate(el => { el.scrollLeft = 300 })

  // Item name should still be visible (sticky)
  await expect(firstItemLink).toBeInViewport()
})

test('table scrolls horizontally on mobile', async ({ page }) => {
  const container = page.locator('[data-testid="table-container"]')
  const scrollWidth = await container.evaluate(el => el.scrollWidth)
  const clientWidth = await container.evaluate(el => el.clientWidth)
  // Table should overflow horizontally on 390px viewport
  expect(scrollWidth).toBeGreaterThan(clientWidth)
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun run test:e2e tests/e2e/mobile-layout.test.ts -g "item column|table scrolls"`

Expected: Fails — no `data-testid="table-container"`, no sticky positioning.

- [x] **Step 3: Implement sticky first column**

Modify `src/lib/components/OpportunityTable.svelte`:

Change the outer container (line 98) from:
```svelte
<div class="flex-1 overflow-y-auto min-h-0">
```
to:
```svelte
<div data-testid="table-container" class="flex-1 overflow-auto min-h-0">
```

(`overflow-auto` replaces `overflow-y-auto` to enable both axes.)

Add sticky classes to the header `<th>` for Item column. Change line 102 from:
```svelte
<th>Item</th>
```
to:
```svelte
<th class="sticky left-0 z-20 bg-base-200">Item</th>
```

(`z-20` because `table-pin-rows` makes thead sticky vertically — the top-left cell needs to sit above both sticky axes.)

Add sticky classes to the Item `<td>` in each row. Change line 118 from:
```svelte
<td>
```
to:
```svelte
<td class="sticky left-0 z-10 bg-base-100 group-hover/row:bg-base-300 border-r border-base-300">
```

To make the hover background work on the sticky cell, add `group/row` to the `<tr>`. Change line 116 from:
```svelte
<tr class="hover:bg-base-300">
```
to:
```svelte
<tr class="group/row hover:bg-base-300">
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bun run test:e2e tests/e2e/mobile-layout.test.ts -g "item column|table scrolls"`

Expected: PASS

- [x] **Step 5: Run full test suite for regressions**

Run: `bun run test` and `bun run test:e2e`

Expected: All tests pass. Existing `opportunity-table.test.ts` tests target desktop viewport and should be unaffected by sticky CSS. Check that `td:first-child` locators in existing tests still work with the added classes.

- [x] **Step 6: Commit**

```bash
git add tests/e2e/mobile-layout.test.ts src/lib/components/OpportunityTable.svelte
git commit -m "feat(ENG-48): sticky Item column and horizontal scroll on table"
```

---

### Task 7: Visual verification with Playwright

This is not a code task — it's a manual verification step using Playwright's browser tools.

- [x] **Step 1: Start dev server and visually verify mobile layout**

Run `bun run dev` in the worktree, then use Playwright MCP tools to verify at 390×844 (portrait) and 844×390 (landscape):

Portrait checks:
- Hamburger button visible in TopBar
- No sidebar visible
- Tap hamburger → drawer slides in with nav items
- Tap backdrop → drawer closes
- ThresholdControls expand → controls are stacked vertically, sliders full-width
- Table scrolls horizontally, Item column stays pinned
- Footer text is readable, padding aligned with content

Landscape checks:
- Same hamburger/drawer behavior (no sidebar)
- Table shows most/all columns without scrolling
- Sticky column still functional if table overflows

Desktop (1280×800) check:
- Sidebar visible, hamburger hidden
- Layout unchanged from before

- [x] **Step 2: Fix any visual issues found**

If any visual issues are found, fix them and re-run the relevant e2e tests.

- [x] **Step 3: Final full test run**

Run: `bun run test` and `bun run test:e2e`

Expected: All tests pass.

- [x] **Step 4: Commit any fixes**

If fixes were made, commit them with a descriptive message.
