import { test, expect, type Page } from '@playwright/test'

const ITEM_ID = 2394
const EN_NAME = 'Bronze Ornamental Hammer'
const ICON_PATH = '/i/052000/052653.tex'

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
})
