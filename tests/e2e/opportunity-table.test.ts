import { test, expect } from '@playwright/test'

test('dev server starts and page loads', async ({ page }) => {
  await page.goto('/arbitrage')
  await expect(page).toHaveTitle(/.*/)
})
