# Tailwind CSS + DaisyUI Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all raw CSS `<style>` blocks with Tailwind utility classes and DaisyUI component classes, and add column header tooltips to the opportunity table.

**Architecture:** Install Tailwind CSS v4 (via `@tailwindcss/vite` Vite plugin) and DaisyUI 5 (via `@plugin` CSS directive). Migrate 4 Svelte components one at a time, removing `<style>` blocks and replacing with inline classes. DaisyUI's built-in `night` theme provides the dark color scheme.

**Tech Stack:** Tailwind CSS v4, DaisyUI 5, Svelte 5, Vite 6

**Spec:** `docs/superpowers/specs/2026-04-02-tailwind-daisyui-migration-design.md` and `docs/superpowers/specs/2026-04-02-column-tooltips-design.md`

---

## File Map

- Create: `src/client/app.css` — Tailwind imports, DaisyUI plugin config, custom keyframes
- Modify: `vite.config.ts` — add `@tailwindcss/vite` plugin
- Modify: `src/client/main.ts` — import `app.css`
- Modify: `src/client/App.svelte` — replace `<style>` block with Tailwind/DaisyUI classes
- Modify: `src/client/components/StatusBar.svelte` — replace `<style>` block with Tailwind/DaisyUI classes
- Modify: `src/client/components/ThresholdControls.svelte` — replace `<style>` block with Tailwind/DaisyUI classes
- Modify: `src/client/components/OpportunityTable.svelte` — replace `<style>` block with Tailwind/DaisyUI classes, add tooltips

---

### Task 1: Install dependencies and configure Tailwind + DaisyUI

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `vite.config.ts`
- Create: `src/client/app.css`
- Modify: `src/client/main.ts`

- [ ] **Step 1: Install Tailwind CSS v4, Vite plugin, and DaisyUI 5**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-rowenas-secret
bun add -d tailwindcss @tailwindcss/vite daisyui@latest
```

- [ ] **Step 2: Add `@tailwindcss/vite` plugin to `vite.config.ts`**

Current file at `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist/client',
  },
  root: '.',
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
```

Add the tailwindcss import and plugin. The `tailwindcss()` plugin must come **before** `svelte()`:

```ts
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    outDir: 'dist/client',
  },
  root: '.',
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
```

- [ ] **Step 3: Create `src/client/app.css`**

This file imports Tailwind, configures DaisyUI with the `night` theme as default, and defines the custom `pulse-bright` keyframe animation for the StatusBar flash.

```css
@import "tailwindcss";

@plugin "daisyui" {
  themes: night --default;
}

@keyframes pulse-bright {
  0%, 100% { color: currentColor; }
  50% { color: oklch(var(--bc)); }
}

@utility animate-pulse-bright {
  animation: pulse-bright 0.6s ease 3;
}
```

Note: `oklch(var(--bc))` is DaisyUI's `base-content` color (bright text). This replaces the old hardcoded `#fff` / `#aaa` flash with theme-aware colors. If the flash doesn't look right after testing, adjust to use a hardcoded light color like `#fff`.

- [ ] **Step 4: Import `app.css` in `src/client/main.ts`**

```ts
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
```

The CSS import must be first so DaisyUI's base styles are active before any component renders.

- [ ] **Step 5: Verify the dev server starts without errors**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-rowenas-secret
bun run dev:client
```

Open the browser. The page will look different (DaisyUI's night theme base styles now apply to the body), but no errors should appear in the console. The existing `<style>` blocks in components still apply on top of the theme — this is expected and temporary.

Press Ctrl+C to stop the dev server after verifying.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lockb vite.config.ts src/client/app.css src/client/main.ts
git commit -m "feat: add Tailwind CSS v4 and DaisyUI 5 infrastructure"
```

---

### Task 2: Migrate App.svelte

**Files:**
- Modify: `src/client/App.svelte`

Reference the current file at `src/client/App.svelte`. Remove the entire `<style>` block and replace all class references with Tailwind/DaisyUI classes inline.

- [ ] **Step 1: Replace the template and remove `<style>` block**

Replace the template section (everything from `<div class="app">` to the closing `</div>`) and remove the `<style>...</style>` block. The `<script>` block stays exactly as-is.

New template:

```svelte
<div class="flex flex-col min-h-screen">
  <header class="py-5 bg-base-200 border-b border-base-300">
    <h1 class="m-0 px-8 max-w-[1400px] mx-auto w-full box-border text-base-content text-xl font-semibold">
      羅薇娜的商業機密
    </h1>
  </header>

  <div class="flex-1 max-w-[1400px] w-full mx-auto px-8 box-border">
    {#if meta.scanCompletedAt > 0}
      <StatusBar {meta} {flash} />
    {/if}

    <ThresholdControls {thresholds} onchange={onThresholdChange} />

    <main>
      {#if coldStart}
        {@const pct = scanProgress.totalBatches > 0
          ? Math.round((scanProgress.completedBatches / scanProgress.totalBatches) * 100)
          : 0}
        <div class="py-12 px-8 text-center">
          <p class="pb-4 text-base-content/50 text-center">Initial scan in progress…</p>
          <progress class="progress progress-primary w-full max-w-sm mx-auto block" value={pct} max="100"></progress>
          <p class="mt-3 text-base-content/40 text-sm">{scanProgress.phase || 'Starting…'} — {pct}%</p>
        </div>
      {:else if loading}
        <p class="p-8 text-base-content/50 text-center">Loading…</p>
      {:else if error}
        <p class="p-8 text-error text-center">Error: {error}</p>
      {:else if opportunities.length === 0}
        <p class="p-8 text-base-content/50 text-center">No opportunities found with current filters.</p>
      {:else}
        <p class="mt-3 mb-1 text-base-content/50 text-sm">Showing {opportunities.length} opportunities</p>
        <OpportunityTable {opportunities} />
      {/if}
    </main>
  </div>

  <footer class="p-5 px-8 text-center text-base-content/40 text-xs border-t border-base-300 mt-6">
    <p class="my-1">Built with ♥ by <a class="link link-info no-underline hover:underline" href="https://yhkao.com" target="_blank" rel="noopener">Yshan</a></p>
    <p class="my-1">Data sourced from <a class="link link-info no-underline hover:underline" href="https://universalis.app" target="_blank" rel="noopener">Universalis</a></p>
    <p class="my-1 text-base-content/30 text-[11px]">FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. © SQUARE ENIX CO., LTD. All Rights Reserved.</p>
  </footer>
</div>
```

Delete the entire `<style>...</style>` block (lines 119-154 of the current file).

- [ ] **Step 2: Verify visually**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-rowenas-secret
bun run dev:client
```

Check that layout, header, footer, cold-start progress bar, loading/error messages all render correctly with the DaisyUI night theme. Press Ctrl+C when done.

- [ ] **Step 3: Commit**

```bash
git add src/client/App.svelte
git commit -m "refactor: migrate App.svelte from raw CSS to Tailwind/DaisyUI"
```

---

### Task 3: Migrate StatusBar.svelte

**Files:**
- Modify: `src/client/components/StatusBar.svelte`

- [ ] **Step 1: Replace the template and remove `<style>` block**

The `<script>` block stays exactly as-is. Replace the template and delete the `<style>` block.

New template:

```svelte
{#if isVeryStale}
  <div role="alert" class="alert alert-error text-sm py-2 px-4 rounded-none">
    ⚠️ Data very outdated — last scan {lastScanLabel}
  </div>
{:else if isStale}
  <div role="alert" class="alert alert-warning text-sm py-2 px-4 rounded-none">
    ⚠️ Data may be outdated — last scan {lastScanLabel}
  </div>
{:else}
  <div class="py-2 px-4 bg-base-200 text-base-content/60 text-sm">
    <span class:animate-pulse-bright={flash}>Last scan: {lastScanLabel}</span>
  </div>
{/if}
```

Delete the entire `<style>...</style>` block.

Note: `class:animate-pulse-bright={flash}` uses the custom utility defined in `app.css`. DaisyUI `alert` components are used for stale/severe states with `rounded-none` since the bar spans full width.

- [ ] **Step 2: Verify visually**

Check that the normal status bar, stale warning (yellow), and severe warning (red) all display correctly. The flash animation should pulse text brightness when a new scan arrives.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/StatusBar.svelte
git commit -m "refactor: migrate StatusBar.svelte from raw CSS to Tailwind/DaisyUI"
```

---

### Task 4: Migrate ThresholdControls.svelte

**Files:**
- Modify: `src/client/components/ThresholdControls.svelte`

- [ ] **Step 1: Replace the template and remove `<style>` block**

The `<script>` block stays exactly as-is. Replace the template and delete the `<style>` block.

Note: We do NOT use DaisyUI's `collapse` component here because it manages open/close state via HTML focus/checkbox, which conflicts with the existing Svelte `open` state variable. We keep the Svelte `{#if open}` toggle logic and just style with Tailwind utilities + DaisyUI form classes.

New template:

```svelte
<div class="bg-base-200 border-b border-base-300">
  <button class="w-full py-2.5 px-4 bg-transparent border-none text-base-content cursor-pointer text-left text-sm" onclick={() => (open = !open)}>
    ⚙ Filters {open ? '▲' : '▼'}
  </button>

  {#if open}
    <div class="flex flex-wrap gap-5 px-4 pt-3 pb-4">
      <label class="flex flex-col gap-1 text-base-content/60 text-sm min-w-40">
        Price threshold: {thresholds.price_threshold}×
        <div class="flex items-center gap-2">
          <input type="range" class="range range-sm flex-1" min="1.2" max="5.0" step="0.1"
            value={thresholds.price_threshold}
            oninput={(e) => emit({ price_threshold: Number((e.target as HTMLInputElement).value) })}
          />
          <input type="number" class="input input-sm w-16" min="1.2" max="5.0" step="0.1"
            value={thresholds.price_threshold}
            onchange={(e) => clampEmit('price_threshold', Number((e.target as HTMLInputElement).value), 1.2, 5.0)}
          />
        </div>
      </label>

      <label class="flex flex-col gap-1 text-base-content/60 text-sm min-w-40">
        Listing staleness: {thresholds.listing_staleness_hours}h
        <div class="flex items-center gap-2">
          <input type="range" class="range range-sm flex-1" min="1" max="168" step="1"
            value={thresholds.listing_staleness_hours}
            oninput={(e) => emit({ listing_staleness_hours: Number((e.target as HTMLInputElement).value) })}
          />
          <input type="number" class="input input-sm w-16" min="1" max="168" step="1"
            value={thresholds.listing_staleness_hours}
            onchange={(e) => clampEmit('listing_staleness_hours', Number((e.target as HTMLInputElement).value), 1, 168)}
          />
        </div>
      </label>

      <label class="flex flex-col gap-1 text-base-content/60 text-sm min-w-40">
        Days of supply: {thresholds.days_of_supply}
        <div class="flex items-center gap-2">
          <input type="range" class="range range-sm flex-1" min="1" max="14" step="1"
            value={thresholds.days_of_supply}
            oninput={(e) => emit({ days_of_supply: Number((e.target as HTMLInputElement).value) })}
          />
          <input type="number" class="input input-sm w-16" min="1" max="14" step="1"
            value={thresholds.days_of_supply}
            onchange={(e) => clampEmit('days_of_supply', Number((e.target as HTMLInputElement).value), 1, 14)}
          />
        </div>
      </label>

      <label class="flex flex-row items-center gap-2 text-base-content/60 text-sm">
        <input type="checkbox" class="checkbox checkbox-sm"
          checked={thresholds.hq}
          onchange={(e) => emit({ hq: (e.target as HTMLInputElement).checked })}
        />
        HQ only
      </label>

      <label class="flex flex-col gap-1 text-base-content/60 text-sm">
        Results:
        <select class="select select-sm"
          value={String(thresholds.limit)}
          onchange={(e) => emit({ limit: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
      </label>
    </div>
  {/if}
</div>
```

Delete the entire `<style>...</style>` block.

- [ ] **Step 2: Verify visually**

Check that the filter toggle opens/closes, sliders and number inputs work, checkbox toggles, and select dropdown functions. All form elements should be styled by DaisyUI.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ThresholdControls.svelte
git commit -m "refactor: migrate ThresholdControls.svelte from raw CSS to Tailwind/DaisyUI"
```

---

### Task 5: Migrate OpportunityTable.svelte and add column tooltips

**Files:**
- Modify: `src/client/components/OpportunityTable.svelte`

This is the largest migration. It combines the style migration with the new tooltip feature.

**Tooltip text** (from `docs/superpowers/specs/2026-04-02-column-tooltips-design.md`):

| Column | data-tip text |
|---|---|
| Sell | Estimated sell price: the lower of the cheapest listing and the median recent sale. Second line (if shown) is the current cheapest listing on the market board. |
| Profit/unit | Sell price after 5% tax, minus buy price. Second line (if shown) uses the market board listing instead. |
| Units | Recommended / available at source. Recommended is capped by fair-share velocity × days of supply. |
| Comp | Active competing listings on the home world near the expected sell price. |
| Vel | Your fair share of daily sales: total velocity ÷ (competitors + 1). Second line shows total market velocity. |
| Gil/day | Expected daily profit: profit per unit × fair-share velocity. Second line (if shown) is an alternative source world, for comparison only — all other columns use the primary source. |

**Tooltip icon:** An inline SVG info circle, small (14px), muted color, placed after the header text.

- [ ] **Step 1: Replace the template and remove `<style>` block**

The `<script>` block stays exactly as-is. Replace the template and delete the `<style>` block.

New template:

```svelte
{#snippet infoIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="inline w-3.5 h-3.5 opacity-40">
    <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
  </svg>
{/snippet}

<div class="overflow-x-auto">
  <table class="table table-sm">
    <thead>
      <tr>
        <th>Item</th>
        <th>Buy from</th>
        <th>Buy</th>
        <th>
          <div class="tooltip tooltip-bottom" data-tip="Estimated sell price: the lower of the cheapest listing and the median recent sale. Second line (if shown) is the current cheapest listing on the market board.">
            Sell {@render infoIcon()}
          </div>
        </th>
        <th>
          <div class="tooltip tooltip-bottom" data-tip="Sell price after 5% tax, minus buy price. Second line (if shown) uses the market board listing instead.">
            Profit/unit {@render infoIcon()}
          </div>
        </th>
        <th>
          <div class="tooltip tooltip-bottom" data-tip="Recommended / available at source. Recommended is capped by fair-share velocity × days of supply.">
            Units {@render infoIcon()}
          </div>
        </th>
        <th>
          <div class="tooltip tooltip-bottom" data-tip="Active competing listings on the home world near the expected sell price.">
            Comp {@render infoIcon()}
          </div>
        </th>
        <th>
          <div class="tooltip tooltip-bottom" data-tip="Your fair share of daily sales: total velocity ÷ (competitors + 1). Second line shows total market velocity.">
            Vel {@render infoIcon()}
          </div>
        </th>
        <th>
          <div class="tooltip tooltip-bottom" data-tip="Expected daily profit: profit per unit × fair-share velocity. Second line (if shown) is an alternative source world, for comparison only — all other columns use the primary source.">
            Gil/day {@render infoIcon()}
          </div>
        </th>
      </tr>
    </thead>
    <tbody>
      {#each opportunities as opp (opp.itemID)}
        <tr class="hover">
          <!-- Item -->
          <td>
            <a class="link link-info no-underline hover:underline" href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener">
              {name(opp)}
            </a>
          </td>

          <!-- Buy from -->
          <td>
            <div>{opp.sourceWorld}</div>
            {#if opp.altSourceWorld}
              <div class="text-xs text-base-content/50 mt-1">{opp.altSourceWorld}</div>
            {/if}
          </td>

          <!-- Buy -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.buyPrice)}</span>
              <span class="text-xs" style="color: {ageColor(opp.sourceConfidence)}">{ageLabel(opp.sourceDataAgeHours)}</span>
            </div>
            {#if opp.altSourceWorld && opp.altBuyPrice !== undefined}
              <div class="flex items-baseline gap-2.5 mt-1">
                <span class="w-[70px] text-right flex-shrink-0 text-xs text-base-content/50">{fmt(opp.altBuyPrice)}</span>
                {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
                  <span class="text-xs" style="color: {ageColor(opp.altSourceConfidence)}">{ageLabel(opp.altSourceDataAgeHours)}</span>
                {/if}
              </div>
            {/if}
          </td>

          <!-- Sell -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.sellPrice)}</span>
              <span class="text-xs" style="color: {ageColor(opp.homeConfidence)}">{ageLabel(opp.homeDataAgeHours)}</span>
            </div>
            {#if opp.listingPrice !== opp.sellPrice}
              <div class="flex items-baseline gap-2.5 mt-1">
                <span class="w-[70px] text-right flex-shrink-0 text-xs text-base-content/40">{fmt(opp.listingPrice)}</span>
              </div>
            {/if}
          </td>

          <!-- Profit/unit -->
          <td class="tabular-nums">
            <div>{fmt(opp.profitPerUnit)}</div>
            {#if opp.listingProfitPerUnit !== opp.profitPerUnit}
              <div class="text-xs text-base-content/40 mt-1">{fmt(opp.listingProfitPerUnit)}</div>
            {/if}
          </td>

          <!-- Units -->
          <td>
            <div>{opp.recommendedUnits} / {opp.availableUnits}</div>
          </td>

          <!-- Comp -->
          <td>
            <div>{opp.activeCompetitorCount}</div>
          </td>

          <!-- Vel -->
          <td class="tabular-nums">
            <div>{opp.fairShareVelocity}</div>
            <div class="text-xs text-base-content/40 mt-1">{totalVelocity(opp)} total</div>
          </td>

          <!-- Gil/day -->
          <td class="tabular-nums">
            <div>{fmt(opp.expectedDailyProfit)}</div>
            {#if opp.altSourceWorld && opp.altExpectedDailyProfit !== undefined}
              <div class="text-xs text-base-content/50 mt-1">{fmt(opp.altExpectedDailyProfit)}</div>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

Delete the entire `<style>...</style>` block.

Key migration notes:
- `font-variant-numeric: tabular-nums` → Tailwind's `tabular-nums` class on numeric `<td>` elements
- Price/age flex lines → `flex items-baseline gap-2.5` with `w-[70px] text-right flex-shrink-0`
- Secondary text → `text-xs text-base-content/50` (50% opacity of theme text color)
- Meta/muted text → `text-xs text-base-content/40`
- Hover rows → DaisyUI `hover` class on `<tr>` (DaisyUI table modifier — if this doesn't work, fall back to `hover:bg-base-300`)
- Links → DaisyUI `link link-info`
- SVG info icon uses Heroicons "information-circle" (20px solid variant), displayed inline at 14px with muted opacity
- Tooltips use DaisyUI's `tooltip tooltip-bottom` wrapper with `data-tip` attribute
- The info icon is defined as a Svelte 5 snippet (`{#snippet}` / `{@render}`) to avoid repeating the SVG 6 times

- [ ] **Step 2: Verify visually**

Check that:
- Table renders with DaisyUI styling
- Numeric columns are properly aligned (tabular-nums)
- Price lines with age indicators display correctly
- Secondary/alt lines show in muted text
- Hover highlighting works on rows
- Tooltip info icons appear next to Sell, Profit/unit, Units, Comp, Vel, Gil/day headers
- Hovering the info icon (or header text) shows the tooltip with the correct text
- Links to Universalis are styled and clickable

- [ ] **Step 3: Commit**

```bash
git add src/client/components/OpportunityTable.svelte
git commit -m "refactor: migrate OpportunityTable.svelte to Tailwind/DaisyUI and add column tooltips"
```

---

### Task 6: Final verification and cleanup

- [ ] **Step 1: Verify no `<style>` blocks remain in any Svelte component**

```bash
grep -r '<style>' src/client/
```

Expected: no output. If any `<style>` blocks remain, they were missed and need to be removed.

- [ ] **Step 2: Run the full dev server and verify all functionality**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-rowenas-secret
bun run dev:client
```

Walk through:
1. Page loads with DaisyUI night theme (dark background, no white flash)
2. Cold start progress bar works (if no scan data)
3. Status bar shows scan time, stale/severe warnings display correctly
4. Filter panel opens/closes, all controls work (sliders, number inputs, checkbox, select)
5. Table displays opportunities with correct styling
6. Tooltip info icons visible, tooltips appear on hover with correct text
7. Links work
8. Footer displays correctly

- [ ] **Step 3: Run existing tests to check for regressions**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-rowenas-secret
bun test
```

Expected: all tests pass. The existing tests are server-side (scoring, API, scanner, universalis) and should not be affected by CSS changes.

- [ ] **Step 4: Build the production client**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-rowenas-secret
bun run build:client
```

Expected: build succeeds without errors. Tailwind should tree-shake unused utilities in the production build.

- [ ] **Step 5: Commit any remaining changes (if any)**

Only if adjustments were needed during verification:

```bash
git add -A  # only after running git status to verify what's changed
git commit -m "fix: address issues found during Tailwind/DaisyUI migration verification"
```
