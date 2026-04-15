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
