import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'

// Fixture items are ordered by score desc (the API's default):
// Alpha Draught, Beta Elixir, Gamma Ingot, Delta Cloth, Epsilon Ore
const DEFAULT_ORDER = opportunities.map(o => o.itemName)

async function mockApi(page: Page) {
  await page.route('**/api/opportunities**', async route => {
    await route.fulfill({
      json: { opportunities, meta },
    })
  })
  // Return empty results for XIVAPI to keep tests offline and quiet
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
}

/** Read item names from the first column of each table body row. */
async function getRowNames(page: Page): Promise<string[]> {
  return page.locator('table tbody tr td:first-child a').allTextContents()
}

test.describe('OpportunityTable', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('renders all fixture rows', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(opportunities.length)
  })

  test('default order matches API order (by score)', async ({ page }) => {
    const names = await getRowNames(page)
    expect(names).toEqual(DEFAULT_ORDER)
  })

  test('click Gil/day sorts descending', async ({ page }) => {
    await page.click('button[aria-label="Sort by expectedDailyProfit"]')
    const names = await getRowNames(page)
    // expectedDailyProfit desc: 1500, 1000, 800, 500, 300
    expect(names).toEqual([
      'Alpha Draught', 'Epsilon Ore', 'Delta Cloth', 'Gamma Ingot', 'Beta Elixir',
    ])
  })

  test('click Gil/day twice sorts ascending', async ({ page }) => {
    const btn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    await btn.click()
    await btn.click()
    const names = await getRowNames(page)
    // expectedDailyProfit asc: 300, 500, 800, 1000, 1500
    expect(names).toEqual([
      'Beta Elixir', 'Gamma Ingot', 'Delta Cloth', 'Epsilon Ore', 'Alpha Draught',
    ])
  })

  test('click Gil/day three times clears sort (returns to default)', async ({ page }) => {
    const btn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    await btn.click()
    await btn.click()
    await btn.click()
    const names = await getRowNames(page)
    expect(names).toEqual(DEFAULT_ORDER)
  })

  test('clicking a different column switches sort', async ({ page }) => {
    // Sort by Gil/day first
    await page.click('button[aria-label="Sort by expectedDailyProfit"]')
    // Then switch to Profit/unit
    await page.click('button[aria-label="Sort by profitPerUnit"]')
    const names = await getRowNames(page)
    // profitPerUnit desc: 500, 400, 300, 200, 100
    expect(names).toEqual([
      'Alpha Draught', 'Delta Cloth', 'Beta Elixir', 'Epsilon Ore', 'Gamma Ingot',
    ])
  })

  test('sort icon reflects active state', async ({ page }) => {
    const gilDayBtn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    const profitBtn = page.locator('button[aria-label="Sort by profitPerUnit"]')

    // Before clicking: all icons should have opacity-50 (inactive)
    await expect(gilDayBtn.locator('svg')).toHaveClass(/opacity-50/)
    await expect(profitBtn.locator('svg')).toHaveClass(/opacity-50/)

    // Click Gil/day: its icon becomes active (opacity-90), others stay inactive
    await gilDayBtn.click()
    await expect(gilDayBtn.locator('svg')).toHaveClass(/opacity-90/)
    await expect(profitBtn.locator('svg')).toHaveClass(/opacity-50/)

    // Click Profit/unit: it becomes active, Gil/day goes back to inactive
    await profitBtn.click()
    await expect(profitBtn.locator('svg')).toHaveClass(/opacity-90/)
    await expect(gilDayBtn.locator('svg')).toHaveClass(/opacity-50/)
  })

  test('copy button copies item name to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions for the test
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Click the copy button on the first row
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('button[aria-label="Copy item name"]').click()

    // Verify the check icon appears (feedback)
    await expect(firstRow.locator('[data-lucide="check"]')).toBeVisible()

    // Verify clipboard contents
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe('Alpha Draught')

    // Verify the icon reverts to copy after 1.5s
    await expect(firstRow.locator('[data-lucide="copy"]')).toBeVisible({ timeout: 3000 })
  })
})
