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
