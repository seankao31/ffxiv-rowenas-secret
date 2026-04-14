import { test, expect, type Page } from '@playwright/test'

const coldStartResponse = {
  ready: false,
  progress: { phase: 'Scanning batch 1', completedBatches: 3, totalBatches: 10 },
}

async function mockColdStart(page: Page) {
  await page.route('**/api/opportunities**', route => route.fulfill({
    status: 202,
    json: coldStartResponse,
  }))
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
  await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
  await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
}

test.describe('cold start loading', () => {
  test('hides scan parameters during cold start', async ({ page }) => {
    await mockColdStart(page)
    await page.goto('/arbitrage')
    // Progress bar should be visible
    await expect(page.locator('text=Initial scan in progress')).toBeVisible()
    // Scan Parameters section should be hidden
    await expect(page.getByText('Scan Parameters')).not.toBeVisible()
  })
})
