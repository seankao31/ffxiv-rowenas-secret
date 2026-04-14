import { test, expect, type Page } from '@playwright/test'

const ITEM_ID = 2394
const EN_NAME = 'Bronze Ornamental Hammer'
const ICON_PATH = '/i/052000/052653.tex'

function makeListing(i: number) {
  const worlds = [
    { id: 4028, name: '伊弗利特' },
    { id: 4030, name: '利維坦' },
    { id: 4031, name: '鳳凰' },
  ]
  const world = worlds[i % worlds.length]!
  return {
    lastReviewTime: Math.floor(Date.now() / 1000) - (i + 1) * 600,
    pricePerUnit: 100 + i * 50,
    quantity: 1 + (i % 10),
    worldID: world.id,
    worldName: world.name,
    hq: i % 3 === 0,
  }
}

const UNIVERSALIS_RESPONSE = {
  listings: [
    { lastReviewTime: Math.floor(Date.now() / 1000) - 3600, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: true },
    { lastReviewTime: Math.floor(Date.now() / 1000) - 7200, pricePerUnit: 500, quantity: 10, worldID: 4030, worldName: '利維坦', hq: false },
    { lastReviewTime: Math.floor(Date.now() / 1000) - 1800, pricePerUnit: 800, quantity: 1, worldID: 4031, worldName: '鳳凰', hq: false },
  ],
}

const MANY_LISTINGS_RESPONSE = {
  listings: Array.from({ length: 50 }, (_, i) => makeListing(i)),
}

function makeSaleEntry(i: number) {
  const worlds = [
    { id: 4028, name: '伊弗利特' },
    { id: 4030, name: '利維坦' },
    { id: 4031, name: '鳳凰' },
  ]
  const world = worlds[i % worlds.length]!
  return {
    timestamp: Math.floor(Date.now() / 1000) - (i + 1) * 1800,
    pricePerUnit: 150 + i * 30,
    quantity: 1 + (i % 5),
    worldID: world.id,
    worldName: world.name,
    hq: i % 2 === 0,
    buyerName: i % 3 === 0 ? null : `Buyer ${i}`,
  }
}

const HISTORY_RESPONSE = {
  entries: Array.from({ length: 10 }, (_, i) => makeSaleEntry(i)),
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
  // Playwright routes match LIFO (last registered wins). The History route must be
  // registered AFTER the catch-all so it takes priority for /history/ requests.
  // Do not reorder these two routes.
  await page.route('**/universalis.app/api/v2/**', route =>
    route.fulfill({ json: UNIVERSALIS_RESPONSE }),
  )
  await page.route('**/universalis.app/api/v2/history/**', route =>
    route.fulfill({ json: HISTORY_RESPONSE }),
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

  test('shows external reference links', async ({ page }) => {
    const links = page.locator('[data-testid="external-links"]')
    await expect(links).toBeVisible()

    const universalis = links.locator('a', { hasText: 'Universalis' })
    await expect(universalis).toHaveAttribute('href', `https://universalis.app/market/${ITEM_ID}`)
    await expect(universalis).toHaveAttribute('target', '_blank')

    const garland = links.locator('a', { hasText: 'Garland Tools' })
    await expect(garland).toHaveAttribute('href', `https://www.garlandtools.org/db/#item/${ITEM_ID}`)
    await expect(garland).toHaveAttribute('target', '_blank')

    const teamcraft = links.locator('a', { hasText: 'Teamcraft' })
    await expect(teamcraft).toHaveAttribute('href', `https://ffxivteamcraft.com/db/en/item/${ITEM_ID}/`)
    await expect(teamcraft).toHaveAttribute('target', '_blank')
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
    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const table = listingsCard.locator('table')
    await expect(table).toBeVisible()
    // 3 listings in mock data
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(3)
  })

  test('listings table shows correct columns', async ({ page }) => {
    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const headers = listingsCard.locator('table thead th')
    await expect(headers).toHaveCount(6)
    await expect(headers.nth(0)).toContainText('World')
    await expect(headers.nth(1)).toContainText('Price')
    await expect(headers.nth(2)).toContainText('Qty')
    await expect(headers.nth(3)).toContainText('Total')
    await expect(headers.nth(4)).toContainText('HQ')
    await expect(headers.nth(5)).toContainText('Last Review')
  })

  test('listings are sorted by price ascending', async ({ page }) => {
    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const rows = listingsCard.locator('table tbody tr')
    await expect(rows).toHaveCount(3)
    // First row should be cheapest (200)
    const firstRowPrice = rows.nth(0).locator('td').nth(1)
    await expect(firstRowPrice).toContainText('200')
    // Last row should be most expensive (800)
    const lastRowPrice = rows.nth(2).locator('td').nth(1)
    await expect(lastRowPrice).toContainText('800')
  })

  test('world filter narrows results', async ({ page }) => {
    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const select = listingsCard.locator('select')
    await expect(select).toBeVisible()
    await select.selectOption('利維坦')
    const rows = listingsCard.locator('table tbody tr')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('td').first()).toContainText('利維坦')
  })

  test('HQ toggle filters to HQ only', async ({ page }) => {
    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const toggle = listingsCard.locator('input[type="checkbox"]')
    await toggle.check()
    const rows = listingsCard.locator('table tbody tr')
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

  test('listings section scrolls independently without overlapping footer', async ({ page }) => {
    // Override with many listings to force overflow
    await page.route('**/universalis.app/api/v2/**', route =>
      route.fulfill({ json: MANY_LISTINGS_RESPONSE }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    await expect(page.locator('table tbody tr').first()).toBeVisible()

    const footer = page.locator('footer')
    await expect(footer).toBeVisible()

    // The footer should be within the viewport (not pushed off-screen by listings)
    const footerBox = await footer.boundingBox()
    const viewport = page.viewportSize()!
    expect(footerBox).not.toBeNull()
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewport.height)

    // The listings table wrapper should be a scroll container
    const listingsCard = page.locator('[data-testid="listings-scroll-container"]')
    await expect(listingsCard).toBeVisible()
    const overflow = await listingsCard.evaluate(el => getComputedStyle(el).overflowY)
    expect(overflow).toMatch(/auto|scroll/)
  })

  test('shows error message when Universalis is unreachable', async ({ page }) => {
    // Override the Universalis mock to return an error
    await page.route('**/universalis.app/api/v2/**', route =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    )
    await page.goto(`/item/${ITEM_ID}`)
    await expect(page.locator('text=Unable to load listings')).toBeVisible()
  })

  test.describe('Sale history', () => {
    test('shows sale history table with data', async ({ page }) => {
      const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
      const table = historyCard.locator('table')
      await expect(table).toBeVisible()
      const rows = table.locator('tbody tr')
      await expect(rows).toHaveCount(10)
    })

    test('sale history table has correct columns', async ({ page }) => {
      const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
      const headers = historyCard.locator('table thead th')
      await expect(headers).toHaveCount(7)
      await expect(headers.nth(0)).toContainText('World')
      await expect(headers.nth(1)).toContainText('Price')
      await expect(headers.nth(2)).toContainText('Qty')
      await expect(headers.nth(3)).toContainText('Total')
      await expect(headers.nth(4)).toContainText('HQ')
      await expect(headers.nth(5)).toContainText('Buyer')
      await expect(headers.nth(6)).toContainText('Date')
    })

    test('shows buyer name or dash for null', async ({ page }) => {
      const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
      const rows = historyCard.locator('table tbody tr')
      // First entry (i=0) has buyerName: null → should show —
      const firstBuyer = rows.nth(0).locator('td').nth(5)
      await expect(firstBuyer).toContainText('—')
      // Second entry (i=1) has buyerName: 'Buyer 1'
      const secondBuyer = rows.nth(1).locator('td').nth(5)
      await expect(secondBuyer).toContainText('Buyer 1')
    })

    test('shows error when history fetch fails', async ({ page }) => {
      await page.route('**/universalis.app/api/v2/history/**', route =>
        route.fulfill({ status: 500, body: 'Internal Server Error' }),
      )
      await page.goto(`/item/${ITEM_ID}`)
      const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
      await expect(historyCard.locator('text=Unable to load sale history')).toBeVisible()
    })

    test('shows empty message when no history', async ({ page }) => {
      await page.route('**/universalis.app/api/v2/history/**', route =>
        route.fulfill({ json: { entries: [] } }),
      )
      await page.goto(`/item/${ITEM_ID}`)
      const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
      await expect(historyCard.locator('text=No sale history found')).toBeVisible()
    })
  })

  test.describe('Price statistics', () => {
    test('shows price stats with computed values', async ({ page }) => {
      const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
      await expect(statsCard.locator('text=Min Price')).toBeVisible()
      await expect(statsCard.locator('text=Median Price')).toBeVisible()
      await expect(statsCard.locator('text=Avg Price')).toBeVisible()
      await expect(statsCard.locator('text=Volume (24h)')).toBeVisible()
      await expect(statsCard.locator('text=Volume (7d)')).toBeVisible()
    })

    test('shows no data when history is empty', async ({ page }) => {
      await page.route('**/universalis.app/api/v2/history/**', route =>
        route.fulfill({ json: { entries: [] } }),
      )
      await page.goto(`/item/${ITEM_ID}`)
      const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
      await expect(statsCard.locator('text=No data available')).toBeVisible()
    })

    test('shows error when history fetch fails', async ({ page }) => {
      await page.route('**/universalis.app/api/v2/history/**', route =>
        route.fulfill({ status: 500, body: 'Internal Server Error' }),
      )
      await page.goto(`/item/${ITEM_ID}`)
      const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
      await expect(statsCard.locator('text=Unable to load price statistics')).toBeVisible()
    })
  })
})
