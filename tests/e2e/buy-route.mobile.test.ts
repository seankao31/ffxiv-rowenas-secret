import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('Buy Route (mobile layout)', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()

    // Select an item and open the modal
    await page.locator('table tbody tr').first().locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()
    await expect(page.locator('[data-testid="buy-route-modal"]')).toBeVisible()
  })

  test('tapping an item in modal marks it as bought', async ({ page }) => {
    const item = page.locator('[data-testid="route-item"]').first()
    await expect(item).toHaveAttribute('data-state', 'unchecked')
    await item.click()
    await expect(item).toHaveAttribute('data-state', 'bought')
  })

  test('modal item rows use button elements for touch compatibility', async ({ page }) => {
    // Unchecked items: primary tap target is a <button> inside the row
    const uncheckedItem = page.locator('[data-testid="route-item"][data-state="unchecked"]').first()
    const innerButton = uncheckedItem.locator(':scope > button').first()
    const tagName = await innerButton.evaluate(el => el.tagName.toLowerCase())
    expect(tagName).toBe('button')

    // Bought items: the entire row is a <button>
    await uncheckedItem.click()
    const boughtItem = page.locator('[data-testid="route-item"][data-state="bought"]').first()
    const boughtTag = await boughtItem.evaluate(el => el.tagName.toLowerCase())
    expect(boughtTag).toBe('button')
  })

  test('copy button is hidden in modal on mobile', async ({ page }) => {
    const modal = page.locator('[data-testid="buy-route-modal"]')
    const copyBtn = modal.locator('[data-testid="route-item"][data-state="unchecked"]').first().locator('button[aria-label="Copy item name"]')
    await expect(copyBtn).toBeHidden()
  })

  test('close button has adequate tap target', async ({ page }) => {
    const closeBtn = page.locator('[data-testid="buy-route-modal"] button.btn[aria-label="Close route"]')
    const box = await closeBtn.boundingBox()
    expect(box).toBeTruthy()
    // 44px is the minimum recommended tap target per WCAG/Apple HIG
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})
