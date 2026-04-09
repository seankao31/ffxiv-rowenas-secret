import { test, expect, type Page } from '@playwright/test'

const ITEM_ID = 2394
const EN_NAME = 'Bronze Ornamental Hammer'
const ICON_PATH = '/i/052000/052653.tex'

const UNIVERSALIS_RESPONSE = {
  listings: [
    { lastReviewTime: Math.floor(Date.now() / 1000) - 3600, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: true },
    { lastReviewTime: Math.floor(Date.now() / 1000) - 7200, pricePerUnit: 500, quantity: 10, worldID: 4030, worldName: '利維坦', hq: false },
    { lastReviewTime: Math.floor(Date.now() / 1000) - 1800, pricePerUnit: 800, quantity: 1, worldID: 4031, worldName: '鳳凰', hq: false },
  ],
}

const XIVAPI_RESPONSE = {
  rows: [{
    row_id: ITEM_ID,
    fields: {
      Name: EN_NAME,
      Icon: { id: 0, path: ICON_PATH, path_hr1: '/i/052000/052653_hr1.tex' },
    },
  }],
}

async function mockApi(page: Page) {
  // Mock XIVAPI sheet endpoint for item metadata
  await page.route('**/v2.xivapi.com/api/sheet/Item**', route =>
    route.fulfill({ json: XIVAPI_RESPONSE }),
  )
  // Mock XIVAPI asset endpoint (icon image) — return a 1x1 transparent PNG
  await page.route('**/v2.xivapi.com/api/asset**', route =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
        'Nl7BcQAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  )
  // Mock Universalis DC endpoint for cross-world listings
  await page.route('**/universalis.app/api/v2/**', route =>
    route.fulfill({ json: UNIVERSALIS_RESPONSE }),
  )
}

test.describe('Item detail page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)
  })

  test('shows item name in h1', async ({ page }) => {
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    // The h1 should contain non-empty text (TW name from msgpack data)
    const text = await h1.textContent()
    expect(text!.trim().length).toBeGreaterThan(0)
  })

  test('shows item ID badge', async ({ page }) => {
    const badge = page.locator('.badge')
    await expect(badge).toContainText(String(ITEM_ID))
  })

  test('shows English name as secondary text from XIVAPI', async ({ page }) => {
    // The English name appears as a secondary span alongside the h1
    const secondary = page.locator('span.text-sm', { hasText: EN_NAME })
    await expect(secondary).toBeVisible()
  })

  test('shows all three section cards', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Cross-World Listings' })).toBeVisible()
    await expect(page.locator('h2', { hasText: 'Sale History' })).toBeVisible()
    await expect(page.locator('h2', { hasText: 'Price Statistics' })).toBeVisible()
  })

  test('invalid item ID shows error page', async ({ page }) => {
    await page.goto('/item/abc')
    // SvelteKit default error page shows the status code and message
    await expect(page.locator('text=400')).toBeVisible()
  })

  test('listings table shows data from Universalis', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible()
    // 3 listings in mock data
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(3)
  })

  test('listings table shows correct columns', async ({ page }) => {
    const headers = page.locator('table thead th')
    await expect(headers).toHaveCount(6)
    await expect(headers.nth(0)).toContainText('World')
    await expect(headers.nth(1)).toContainText('Price')
    await expect(headers.nth(2)).toContainText('Qty')
    await expect(headers.nth(3)).toContainText('Total')
    await expect(headers.nth(4)).toContainText('HQ')
    await expect(headers.nth(5)).toContainText('Last Review')
  })

  test('listings are sorted by price ascending', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(3)
    // First row should be cheapest (200)
    const firstRowPrice = rows.nth(0).locator('td').nth(1)
    await expect(firstRowPrice).toContainText('200')
    // Last row should be most expensive (800)
    const lastRowPrice = rows.nth(2).locator('td').nth(1)
    await expect(lastRowPrice).toContainText('800')
  })

  test('world filter narrows results', async ({ page }) => {
    const select = page.locator('select')
    await expect(select).toBeVisible()
    await select.selectOption('利維坦')
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('td').first()).toContainText('利維坦')
  })

  test('HQ toggle filters to HQ only', async ({ page }) => {
    const toggle = page.locator('input[type="checkbox"]')
    await toggle.check()
    const rows = page.locator('table tbody tr')
    // Only 1 HQ listing in mock data
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('td').nth(4)).toContainText('★')
  })

  test('shows empty message when filters match nothing', async ({ page }) => {
    // Select a world with no HQ listings, then enable HQ filter
    const select = page.locator('select')
    await select.selectOption('鳳凰')
    const toggle = page.locator('input[type="checkbox"]')
    await toggle.check()
    await expect(page.locator('text=No listings match the current filters')).toBeVisible()
  })

  test('shows error message when Universalis is unreachable', async ({ page }) => {
    // Override the Universalis mock to return an error
    await page.route('**/universalis.app/api/v2/**', route =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    await expect(page.locator('text=Unable to load listings')).toBeVisible()
  })
})
