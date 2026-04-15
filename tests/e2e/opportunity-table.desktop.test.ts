import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('OpportunityTable (desktop only)', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  // WebKit does not support context.grantPermissions for clipboard-write
  test('copy button copies item name to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('button[aria-label="Copy item name"]').click()

    await expect(firstRow.locator('[data-lucide="check"]')).toBeVisible()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe('Alpha Draught')

    await expect(firstRow.locator('[data-lucide="copy"]')).toBeVisible({ timeout: 3000 })
  })
})
