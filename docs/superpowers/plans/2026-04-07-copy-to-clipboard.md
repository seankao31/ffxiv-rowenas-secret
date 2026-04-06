# Copy-to-Clipboard Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable CopyButton component and integrate it into OpportunityTable so users can one-click copy item names.

**Architecture:** A new `CopyButton.svelte` component encapsulates clipboard write + icon-swap feedback. OpportunityTable imports it and places it after each item name link. Unit tests cover the component, E2E tests verify the full interaction.

**Tech Stack:** Svelte 5, lucide-svelte (Copy/Check icons), DaisyUI, Vitest, Playwright

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/components/CopyButton.svelte` | Reusable copy-to-clipboard button with visual feedback |
| Create | `tests/client/copy-button.test.ts` | Unit tests for CopyButton |
| Modify | `src/lib/components/OpportunityTable.svelte:1-3, 86-95` | Import CopyButton, add it after item name link |
| Modify | `tests/e2e/opportunity-table.test.ts` | E2E test for copy interaction |

---

### Task 1: CopyButton Unit Tests

**Files:**
- Create: `tests/client/copy-button.test.ts`

- [ ] **Step 1: Write failing tests for CopyButton**

```ts
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import CopyButton from '$lib/components/CopyButton.svelte'

describe('CopyButton', () => {
  let target: HTMLElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    document.body.removeChild(target)
  })

  test('renders a button with Copy icon', () => {
    mount(CopyButton, { target, props: { text: 'hello' } })
    const button = target.querySelector('button')
    expect(button).toBeTruthy()
    expect(button!.querySelector('[data-lucide="copy"]')).toBeTruthy()
  })

  test('copies text to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    mount(CopyButton, { target, props: { text: 'Alpha Draught' } })
    target.querySelector('button')!.click()

    expect(writeText).toHaveBeenCalledWith('Alpha Draught')
  })

  test('swaps to Check icon after click, reverts after timeout', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    mount(CopyButton, { target, props: { text: 'hello' } })
    target.querySelector('button')!.click()
    await vi.advanceTimersByTimeAsync(0) // let the promise resolve
    flushSync()

    expect(target.querySelector('[data-lucide="check"]')).toBeTruthy()
    expect(target.querySelector('[data-lucide="copy"]')).toBeNull()

    await vi.advanceTimersByTimeAsync(1500)
    flushSync()

    expect(target.querySelector('[data-lucide="copy"]')).toBeTruthy()
    expect(target.querySelector('[data-lucide="check"]')).toBeNull()

    vi.useRealTimers()
  })

  test('does not swap icon when clipboard write fails', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    mount(CopyButton, { target, props: { text: 'hello' } })
    target.querySelector('button')!.click()
    await vi.advanceTimersByTimeAsync(0)
    flushSync()

    expect(target.querySelector('[data-lucide="copy"]')).toBeTruthy()
    expect(target.querySelector('[data-lucide="check"]')).toBeNull()

    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/client/copy-button.test.ts`
Expected: FAIL — CopyButton module does not exist

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/client/copy-button.test.ts
git commit -m "test: add unit tests for CopyButton component (ENG-53)"
```

---

### Task 2: CopyButton Component

**Files:**
- Create: `src/lib/components/CopyButton.svelte`
- Test: `tests/client/copy-button.test.ts`

- [ ] **Step 1: Implement CopyButton**

```svelte
<script lang="ts">
  import { Copy, Check } from 'lucide-svelte'

  const { text }: { text: string } = $props()

  let copied = $state(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      setTimeout(() => copied = false, 1500)
    } catch {
      // clipboard write failed — no feedback swap
    }
  }
</script>

<button type="button" class="btn btn-ghost btn-xs opacity-50 hover:opacity-90" aria-label="Copy item name" onclick={copy}>
  {#if copied}
    <Check class="w-3.5 h-3.5" strokeWidth={2.5} data-lucide="check" />
  {:else}
    <Copy class="w-3.5 h-3.5" strokeWidth={2.5} data-lucide="copy" />
  {/if}
</button>
```

- [ ] **Step 2: Run unit tests**

Run: `bunx vitest run tests/client/copy-button.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CopyButton.svelte
git commit -m "feat: add CopyButton component with clipboard + feedback (ENG-53)"
```

---

### Task 3: Integrate CopyButton into OpportunityTable

**Files:**
- Modify: `src/lib/components/OpportunityTable.svelte:2-3` (add import)
- Modify: `src/lib/components/OpportunityTable.svelte:91-95` (add CopyButton after link)

- [ ] **Step 1: Add import**

At line 2 of `OpportunityTable.svelte`, add the CopyButton import alongside existing imports:

```svelte
  import CopyButton from '$lib/components/CopyButton.svelte'
```

- [ ] **Step 2: Add CopyButton after the item name link**

Replace the current item cell (lines 86-96):

```svelte
          <!-- Item -->
          <td>
            <div class="flex items-center gap-1.5">
              {#if icon}
                <img src={icon} alt="" width="32" height="32" class="flex-shrink-0"
                  onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              {/if}
              <a class="link link-info no-underline hover:underline" href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener">
                {name(opp)}
              </a>
              <CopyButton text={name(opp)} />
            </div>
          </td>
```

- [ ] **Step 3: Run all existing tests to verify nothing broke**

Run: `bunx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/OpportunityTable.svelte
git commit -m "feat: add copy button to item names in OpportunityTable (ENG-53)"
```

---

### Task 4: E2E Test for Copy Button

**Files:**
- Modify: `tests/e2e/opportunity-table.test.ts`

- [ ] **Step 1: Add E2E test for copy-to-clipboard**

Add this test inside the existing `test.describe('OpportunityTable', ...)` block, after the last test:

```ts
  test('copy button copies item name to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions for the test
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Click the copy button on the first row
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('button[aria-label="Copy item name"]').click()

    // Verify the check icon appears (feedback)
    await expect(firstRow.locator('[data-lucide="check"]')).toBeVisible()

    // Verify clipboard contents
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe('Alpha Draught')

    // Verify the icon reverts to copy after 1.5s
    await expect(firstRow.locator('[data-lucide="copy"]')).toBeVisible({ timeout: 3000 })
  })
```

- [ ] **Step 2: Run E2E tests**

Run: `bunx playwright test tests/e2e/opportunity-table.test.ts`
Expected: All tests PASS (existing + new)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/opportunity-table.test.ts
git commit -m "test(e2e): add copy-to-clipboard button test (ENG-53)"
```
