import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('nav drawer', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
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
    // Click the backdrop area to the right of the 280px nav panel
    await page.locator('[data-testid="nav-drawer-backdrop"]').click({ position: { x: 350, y: 400 } })
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeHidden()
  })

  test('drawer closes on Escape key', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="nav-drawer"]')).toBeHidden()
  })
})
