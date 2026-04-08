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
