import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('Buy Route (desktop layout)', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('clicking an item in modal marks it as bought', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const item = page.locator('[data-testid="route-item"]').first()
    await expect(item).toHaveAttribute('data-state', 'unchecked')
    await item.click()
    await expect(item).toHaveAttribute('data-state', 'bought')
  })

  test('modal panel is constrained to a maximum width on wide screens', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const panel = page.locator('[data-testid="buy-route-panel"]')
    await expect(panel).toBeVisible()

    const box = await panel.boundingBox()
    expect(box).toBeTruthy()
    // max-w-3xl = 768px; panel must not stretch to full viewport width (1280px)
    expect(box!.width).toBeLessThanOrEqual(768)
  })

  test('alt item row height stays constant when marked as bought', async ({ page }) => {
    // Items 101 and 102 both have alt sources, so the modal will contain alt rows.
    // Alt rows in unchecked state show a secondary info line (primary world/price);
    // that line must not vanish on state change — layout shift is jarring.
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await rows.nth(1).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    // Find the positional index of the first alt item. We use a positional (.nth) locator
    // so the reference stays stable after the state changes and Svelte swaps the DOM element.
    const allItems = page.locator('[data-testid="route-item"]')
    let altIndex = -1
    const count = await allItems.count()
    for (let i = 0; i < count; i++) {
      if (await allItems.nth(i).locator('.badge-warning', { hasText: 'alt' }).count() > 0) {
        altIndex = i
        break
      }
    }
    expect(altIndex).toBeGreaterThanOrEqual(0)

    const altItem = allItems.nth(altIndex)
    await expect(altItem).toHaveAttribute('data-state', 'unchecked')

    const boxBefore = await altItem.boundingBox()
    expect(boxBefore).toBeTruthy()

    await altItem.click()
    await expect(altItem).toHaveAttribute('data-state', 'bought')

    const boxAfter = await altItem.boundingBox()
    expect(boxAfter).toBeTruthy()

    expect(Math.abs(boxAfter!.height - boxBefore!.height)).toBeLessThanOrEqual(1)
  })

  test('linked primary row height stays constant when its alt is marked bought', async ({ page }) => {
    // Items 101 and 102 are primary in Carbuncle/Kujata with each other's
    // worlds as alt, producing two linked pairs. Buying an alt marks its
    // linked primary as "dismissed"; the primary row's height must not shift.
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await rows.nth(1).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    // Find the first primary (non-alt) route row and its linked alt row
    // (same itemID, has the 'alt' badge). Indices stay stable across the
    // state swap because we re-resolve via .nth() on the parent locator.
    const allItems = page.locator('[data-testid="route-item"]')
    const count = await allItems.count()
    let primaryIndex = -1
    let altIndex = -1
    let itemName: string | null = null
    for (let i = 0; i < count; i++) {
      const row = allItems.nth(i)
      const isAlt = (await row.locator('.badge-warning', { hasText: 'alt' }).count()) > 0
      const name = (await row.locator('span').first().innerText()).trim()
      if (!isAlt && primaryIndex < 0) {
        primaryIndex = i
        itemName = name
      } else if (isAlt && itemName !== null && name === itemName) {
        altIndex = i
        break
      }
    }
    expect(primaryIndex).toBeGreaterThanOrEqual(0)
    expect(altIndex).toBeGreaterThanOrEqual(0)

    const primary = allItems.nth(primaryIndex)
    const alt = allItems.nth(altIndex)

    await expect(primary).toHaveAttribute('data-state', 'unchecked')
    const boxBefore = await primary.boundingBox()
    expect(boxBefore).toBeTruthy()

    await alt.click()
    await expect(primary).toHaveAttribute('data-state', 'dismissed')

    const boxAfter = await primary.boundingBox()
    expect(boxAfter).toBeTruthy()

    expect(Math.abs(boxAfter!.height - boxBefore!.height)).toBeLessThanOrEqual(1)
  })

  test('linked alt row height stays constant when its primary is marked bought', async ({ page }) => {
    // Reverse of the previous test: buy the primary and assert the linked
    // alt row (which transitions to "dismissed") does not shift in height.
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await rows.nth(1).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const allItems = page.locator('[data-testid="route-item"]')
    const count = await allItems.count()
    let primaryIndex = -1
    let altIndex = -1
    let itemName: string | null = null
    for (let i = 0; i < count; i++) {
      const row = allItems.nth(i)
      const isAlt = (await row.locator('.badge-warning', { hasText: 'alt' }).count()) > 0
      const name = (await row.locator('span').first().innerText()).trim()
      if (!isAlt && primaryIndex < 0) {
        primaryIndex = i
        itemName = name
      } else if (isAlt && itemName !== null && name === itemName) {
        altIndex = i
        break
      }
    }
    expect(primaryIndex).toBeGreaterThanOrEqual(0)
    expect(altIndex).toBeGreaterThanOrEqual(0)

    const primary = allItems.nth(primaryIndex)
    const alt = allItems.nth(altIndex)

    await expect(alt).toHaveAttribute('data-state', 'unchecked')
    const boxBefore = await alt.boundingBox()
    expect(boxBefore).toBeTruthy()

    await primary.click()
    await expect(alt).toHaveAttribute('data-state', 'dismissed')

    const boxAfter = await alt.boundingBox()
    expect(boxAfter).toBeTruthy()

    expect(Math.abs(boxAfter!.height - boxBefore!.height)).toBeLessThanOrEqual(1)
  })

  test('row height stays constant when toggled to missing', async ({ page }) => {
    // Marking an item as missing must not shift the row height — regression
    // guard for the flex-wrapper strut difference that previously caused
    // a ~4px jump between unchecked and missing states.
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const item = page.locator('[data-testid="route-item"]').first()
    await expect(item).toHaveAttribute('data-state', 'unchecked')
    const boxBefore = await item.boundingBox()
    expect(boxBefore).toBeTruthy()

    await item.locator('button[aria-label="Mark as missing"]').click()
    await expect(item).toHaveAttribute('data-state', 'missing')

    const boxAfter = await item.boundingBox()
    expect(boxAfter).toBeTruthy()

    expect(Math.abs(boxAfter!.height - boxBefore!.height)).toBeLessThanOrEqual(1)
  })

  test('all modal rows share the same height regardless of alt presence', async ({ page }) => {
    // Item 103 has no alt, items 101/102 do. Select them all and assert
    // every row in the modal has the same height — prevents the visual
    // inconsistency where alt-bearing rows were taller than non-alt rows.
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await rows.nth(1).locator('td:nth-child(3)').click()
    await rows.nth(2).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const allItems = page.locator('[data-testid="route-item"]')
    const count = await allItems.count()
    expect(count).toBeGreaterThanOrEqual(3)

    const heights: number[] = []
    for (let i = 0; i < count; i++) {
      const box = await allItems.nth(i).boundingBox()
      expect(box).toBeTruthy()
      heights.push(box!.height)
    }
    const minH = Math.min(...heights)
    const maxH = Math.max(...heights)
    expect(maxH - minH).toBeLessThanOrEqual(1)
  })

  test('floating action bar does not overlap footer', async ({ page }) => {
    await page.locator('table tbody tr').first().locator('td:nth-child(3)').click()
    const fab = page.locator('[data-testid="floating-action-bar"]')
    await expect(fab).toBeVisible()

    const fabBox = await fab.boundingBox()
    const footerBox = await page.locator('footer').boundingBox()

    expect(fabBox).toBeTruthy()
    expect(footerBox).toBeTruthy()
    // FAB's bottom edge must be at or above the footer's top edge
    expect(fabBox!.y + fabBox!.height).toBeLessThanOrEqual(footerBox!.y)
  })
})
