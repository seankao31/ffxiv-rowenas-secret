import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'

async function mockApi(page: Page) {
  await page.route('**/api/opportunities**', async route => {
    await route.fulfill({ json: { opportunities, meta } })
  })
  // Mock XIVAPI item search (used by name cache)
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
  // Return empty results for Garland Tools to keep tests offline and quiet
  await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
  await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
}

test.describe('Buy Route', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('clicking a row selects it with visual feedback', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    // Click on the Buy column (not the item name link)
    await firstRow.locator('td:nth-child(3)').click()
    await expect(firstRow).toHaveClass(/border-primary/)
    await expect(firstRow).toHaveClass(/bg-primary/)
  })

  test('clicking a selected row deselects it', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td:nth-child(3)').click()
    await expect(firstRow).toHaveClass(/border-primary/)
    await firstRow.locator('td:nth-child(3)').click()
    await expect(firstRow).not.toHaveClass(/border-primary/)
  })

  test('clicking item name navigates instead of selecting', async ({ page }) => {
    const link = page.locator('table tbody tr').first().locator('td:first-child a')
    await link.click()
    await expect(page).toHaveURL(/\/item\/101/)
  })

  test('floating action bar appears when items selected', async ({ page }) => {
    await expect(page.locator('[data-testid="floating-action-bar"]')).toBeHidden()
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td:nth-child(3)').click()
    await expect(page.locator('[data-testid="floating-action-bar"]')).toBeVisible()
    await expect(page.locator('[data-testid="floating-action-bar"]')).toContainText('1 item selected')
  })

  test('Clear button deselects all items', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await rows.nth(1).locator('td:nth-child(3)').click()
    await expect(page.locator('[data-testid="floating-action-bar"]')).toContainText('2 items')
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Clear' }).click()
    await expect(page.locator('[data-testid="floating-action-bar"]')).toBeHidden()
  })

  test('Plan Route opens modal with world groups', async ({ page }) => {
    // Select two items from different worlds
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click() // Carbuncle
    await rows.nth(1).locator('td:nth-child(3)').click() // Kujata
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const modal = page.locator('[data-testid="buy-route-modal"]')
    await expect(modal).toBeVisible()
    // Should have world groups
    const groups = modal.locator('[data-testid="world-group"]')
    await expect(groups).toHaveCount(2) // Alpha (primary Carbuncle) + Beta (primary Kujata) = 2 groups
  })

  test('modal closes on Escape', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()
    await expect(page.locator('[data-testid="buy-route-modal"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="buy-route-modal"]')).toBeHidden()
  })

  test('modal closes on backdrop click', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()
    await page.locator('[data-testid="buy-route-backdrop"]').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('[data-testid="buy-route-modal"]')).toBeHidden()
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

  test('clicking missing button marks item as missing', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await rows.nth(0).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const item = page.locator('[data-testid="route-item"]').first()
    await item.locator('button[aria-label="Mark as missing"]').click()
    await expect(item).toHaveAttribute('data-state', 'missing')
  })

  test('closing modal preserves table selections', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()
    await page.keyboard.press('Escape')
    // Selection should still be there
    await expect(firstRow).toHaveClass(/border-primary/)
    await expect(page.locator('[data-testid="floating-action-bar"]')).toBeVisible()
  })

  test('floating action bar is hidden while modal is open', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()
    await expect(page.locator('[data-testid="floating-action-bar"]')).toBeHidden()
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

  test('floating action bar buttons are comfortably sized', async ({ page }) => {
    await page.locator('table tbody tr').first().locator('td:nth-child(3)').click()
    const planRouteBtn = page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' })
    await expect(planRouteBtn).toBeVisible()

    const btnBox = await planRouteBtn.boundingBox()
    expect(btnBox).toBeTruthy()
    // Default DaisyUI button is 40px tall — btn-sm is only 32px
    expect(btnBox!.height).toBeGreaterThanOrEqual(40)
  })
})
