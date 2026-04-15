import { test, expect, type Page } from '@playwright/test'

const CJK_PATTERN = /[\u4e00-\u9fff]/

// --- Arbitrage page mocks ---

const ARBITRAGE_OPPORTUNITIES = [
  {
    itemID: 101, itemName: '藥水',
    buyPrice: 500, sellPrice: 1100, listingPrice: 1100,
    profitPerUnit: 500, listingProfitPerUnit: 500,
    sourceWorld: 'Carbuncle', sourceWorldID: 45, sellDestination: 'mb',
    availableUnits: 10, recommendedUnits: 5,
    expectedDailyProfit: 1500, score: 90,
    homeDataAgeHours: 0.5, homeConfidence: 0.9,
    sourceDataAgeHours: 0.3, sourceConfidence: 0.95,
    activeCompetitorCount: 2, fairShareVelocity: 3.0,
  },
]

const ARBITRAGE_META = {
  scanCompletedAt: Date.now(),
  itemsScanned: 500,
  itemsWithOpportunities: 1,
  nextScanEstimatedAt: Date.now() + 30_000,
}

// --- Item detail page mocks ---

const ITEM_ID = 2394

const XIVAPI_RESPONSE = {
  rows: [{
    row_id: ITEM_ID,
    fields: {
      Name: 'Bronze Ornamental Hammer',
      Icon: { id: 0, path: '/i/052000/052653.tex', path_hr1: '/i/052000/052653_hr1.tex' },
    },
  }],
}

const UNIVERSALIS_RESPONSE = {
  listings: [
    { lastReviewTime: Math.floor(Date.now() / 1000) - 3600, pricePerUnit: 200, quantity: 5, worldID: 4028, worldName: '伊弗利特', hq: false },
  ],
}

const HISTORY_RESPONSE = { entries: [] }

// --- Crafting tab mocks ---

const CRAFT_API_RESPONSE = {
  root: {
    itemId: ITEM_ID,
    itemName: '青銅裝飾鐵鎚',
    amount: 1,
    action: 'craft',
    unitCost: 320,
    totalCost: 320,
    confidence: 0.92,
    recipe: {
      recipeId: 100,
      job: 10,
      level: 5,
      yields: 1,
      ingredients: [
        {
          itemId: 5056,
          itemName: '青銅鑄塊',
          amount: 3,
          action: 'buy',
          unitCost: 50,
          totalCost: 150,
          confidence: 0.88,
          marketPrice: 50,
          vendorPrice: null,
          craftCost: 200,
          marketWorld: '利維坦',
          recipe: null,
        },
      ],
    },
    marketPrice: 500,
    vendorPrice: null,
    craftCost: 320,
    marketWorld: '伊弗利特',
  },
  totalCost: 320,
  confidence: 0.88,
  recommendation: 'craft',
  cheapestListing: { price: 500, world: '伊弗利特' },
  realisticSellPrice: null,
  profitVsBuy: null,
  profitVsSell: null,
}

// --- Helpers ---

async function mockArbitrageApi(page: Page) {
  await page.route('**/api/opportunities**', route =>
    route.fulfill({ json: { opportunities: ARBITRAGE_OPPORTUNITIES, meta: ARBITRAGE_META } }),
  )
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
  await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
  await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
}

async function mockItemDetailApi(page: Page) {
  await page.route('**/v2.xivapi.com/api/sheet/Item**', route =>
    route.fulfill({ json: XIVAPI_RESPONSE }),
  )
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
  await page.route('**/universalis.app/api/v2/history/**', route =>
    route.fulfill({ json: HISTORY_RESPONSE }),
  )
  await page.route('**/universalis.app/api/v2/**', route =>
    route.fulfill({ json: UNIVERSALIS_RESPONSE }),
  )
  await page.route(`**/api/craft/${ITEM_ID}`, route =>
    route.fulfill({ json: CRAFT_API_RESPONSE }),
  )
}

// --- Smoke tests ---

test.describe('Chinese item names smoke test', () => {
  test('arbitrage table renders CJK item names', async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()

    const firstName = await page.locator('table tbody tr td:first-child a').first().textContent()
    expect(firstName).toMatch(CJK_PATTERN)
  })

  test('item detail h1 renders CJK item name', async ({ page }) => {
    await mockItemDetailApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    const text = await h1.textContent()
    expect(text).toMatch(CJK_PATTERN)
  })

  test('crafting tree renders CJK item names', async ({ page }) => {
    await mockItemDetailApi(page)
    await page.goto(`/item/${ITEM_ID}?tab=crafting`)

    // Wait for the crafting breakdown to load
    await expect(page.locator('[data-testid="craft-node"]').first()).toBeVisible()

    // Check root node has CJK name
    const rootLink = page.getByRole('link', { name: CJK_PATTERN }).first()
    await expect(rootLink).toBeVisible()

    // Check at least one ingredient also has CJK name
    const allLinks = page.locator('[data-testid="craft-node"] a, [data-testid="buy-leaf"] a, [data-testid="buy-recipe-node"] a, [data-testid="vendor-leaf"] a')
    const count = await allLinks.count()
    expect(count).toBeGreaterThan(0)

    let cjkCount = 0
    for (let i = 0; i < count; i++) {
      const text = await allLinks.nth(i).textContent()
      if (text && CJK_PATTERN.test(text)) cjkCount++
    }
    expect(cjkCount).toBeGreaterThan(1) // root + at least one ingredient
  })
})
