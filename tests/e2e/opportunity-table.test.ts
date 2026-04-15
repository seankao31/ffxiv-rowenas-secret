import { test, expect, type Page } from '@playwright/test'
import { opportunities, meta } from './fixtures/opportunities'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

// Fixture items are ordered by score desc (the API's default):
// Alpha Draught, Beta Elixir, Gamma Ingot, Delta Cloth, Epsilon Ore
const DEFAULT_ORDER = opportunities.map(o => o.itemName)

/** Read item names from the first column of each table body row. */
async function getRowNames(page: Page): Promise<string[]> {
  return page.locator('table tbody tr td:first-child a').allTextContents()
}

test.describe('OpportunityTable', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
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
    // expectedDailyProfit desc: 1500, 1120, 1000, 800, 500, 300
    expect(names).toEqual([
      'Alpha Draught', 'Zeta Potion', 'Epsilon Ore', 'Delta Cloth', 'Gamma Ingot', 'Beta Elixir',
    ])
  })

  test('click Gil/day twice sorts ascending', async ({ page }) => {
    const btn = page.locator('button[aria-label="Sort by expectedDailyProfit"]')
    await btn.click()
    await btn.click()
    const names = await getRowNames(page)
    // expectedDailyProfit asc: 300, 500, 800, 1000, 1120, 1500
    expect(names).toEqual([
      'Beta Elixir', 'Gamma Ingot', 'Delta Cloth', 'Epsilon Ore', 'Zeta Potion', 'Alpha Draught',
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
    // profitPerUnit desc: 560, 500, 400, 300, 200, 100
    expect(names).toEqual([
      'Zeta Potion', 'Alpha Draught', 'Delta Cloth', 'Beta Elixir', 'Epsilon Ore', 'Gamma Ingot',
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

  test('copy button is hidden for unresolved item names', async ({ page }) => {
    // Re-mock API with a fallback-named item, then re-navigate
    await page.route('**/api/opportunities**', route => route.fulfill({
      json: {
        opportunities: [{ ...opportunities[0], itemName: 'Item #9999' }],
        meta,
      },
    }))
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()

    const row = page.locator('table tbody tr').first()
    await expect(row.locator('button[aria-label="Copy item name"]')).toHaveCount(0)
  })

  test('NPC source displays badge instead of world name', async ({ page }) => {
    const npcRow = page.locator('table tbody tr').last() // Zeta Potion is lowest score
    const buyFrom = npcRow.locator('td').nth(1)
    await expect(buyFrom.locator('.badge')).toContainText('NPC')
  })

  test('NPC source shows "NPC" instead of age in buy column', async ({ page }) => {
    const npcRow = page.locator('table tbody tr').last()
    const buyCol = npcRow.locator('td').nth(2)
    await expect(buyCol).toContainText('NPC')
    // Should NOT show "0min ago"
    await expect(buyCol).not.toContainText('ago')
  })

  test('NPC source shows unlimited units', async ({ page }) => {
    const npcRow = page.locator('table tbody tr').last()
    const unitsCol = npcRow.locator('td').nth(5)
    await expect(unitsCol).toContainText('8 / ∞')
  })

  test('buy and sell column age labels do not wrap to multiple lines', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    const buyCol = firstRow.locator('td').nth(2)
    const sellCol = firstRow.locator('td').nth(3)

    // The age label spans in Buy and Sell columns must have whitespace-nowrap
    // to prevent "18min ago" style text from breaking across two lines.
    const buyAgeSpan = buyCol.locator('div').first().locator('span').last()
    const sellAgeSpan = sellCol.locator('div').first().locator('span').last()
    await expect(buyAgeSpan).toHaveClass(/whitespace-nowrap/)
    await expect(sellAgeSpan).toHaveClass(/whitespace-nowrap/)
  })

  test('selected row keeps selection styling visible under hover', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()

    // Before selection: row uses the default hover background
    await expect(firstRow).toHaveClass(/hover:bg-base-300/)

    // Click to select
    await firstRow.click()

    // After selection: default hover must not override the selection background
    const classes = await firstRow.getAttribute('class')
    expect(classes).not.toContain('hover:bg-base-300')
    // Selection-aware hover should be present instead
    expect(classes).toContain('hover:bg-primary')
  })
})

test.describe('vendor-sell display', () => {
  test.beforeEach(async ({ page }) => {
    const vendorOpp = {
      itemID: 201, itemName: 'Vendor Item',
      buyPrice: 100, sellPrice: 200, listingPrice: 200,
      profitPerUnit: 100, listingProfitPerUnit: 100,
      sourceWorld: '利維坦', sourceWorldID: 4030,
      sellDestination: 'vendor',
      availableUnits: 20, recommendedUnits: 20,
      expectedDailyProfit: 0, score: 50,
      homeDataAgeHours: 0, homeConfidence: 1.0,
      sourceDataAgeHours: 0.5, sourceConfidence: 0.9,
      activeCompetitorCount: 0, fairShareVelocity: 0,
    }
    await page.route('**/api/opportunities**', route => route.fulfill({
      json: { opportunities: [vendorOpp], meta },
    }))
    await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
    await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
    await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('shows NPC badge in sell column', async ({ page }) => {
    const sellCol = page.locator('table tbody tr').first().locator('td').nth(3)
    await expect(sellCol.locator('.badge')).toContainText('NPC')
  })

  test('does not show age indicator in sell column', async ({ page }) => {
    const sellCol = page.locator('table tbody tr').first().locator('td').nth(3)
    await expect(sellCol).not.toContainText('ago')
  })

  test('shows vendor sell price', async ({ page }) => {
    const sellCol = page.locator('table tbody tr').first().locator('td').nth(3)
    await expect(sellCol).toContainText('200')
  })
})
