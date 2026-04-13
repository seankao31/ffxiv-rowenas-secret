import { test, expect, type Page } from '@playwright/test'

const CRAFTABLE_ITEM_ID = 2394
const RAW_ITEM_ID = 5111

const XIVAPI_RESPONSE = {
  rows: [
    {
      row_id: CRAFTABLE_ITEM_ID,
      fields: {
        Name: 'Bronze Ornamental Hammer',
        Icon: { id: 0, path: '/i/052000/052653.tex', path_hr1: '/i/052000/052653_hr1.tex' },
      },
    },
    {
      row_id: 5056,
      fields: {
        Name: 'Bronze Ingot',
        Icon: { id: 0, path: '/i/020000/020801.tex', path_hr1: '/i/020000/020801_hr1.tex' },
      },
    },
    {
      row_id: 5111,
      fields: {
        Name: 'Fire Crystal',
        Icon: { id: 0, path: '/i/020000/020001.tex', path_hr1: '/i/020000/020001_hr1.tex' },
      },
    },
  ],
}

async function mockExternalApis(page: Page) {
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
  await page.route('**/universalis.app/api/v2/**', route =>
    route.fulfill({ json: { listings: [] } }),
  )
}

test.describe('Item detail page — tabs', () => {
  test('craftable item shows enabled Market and Crafting tabs', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}`)
    const marketTab = page.locator('[role="tab"]', { hasText: 'Market' })
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await expect(marketTab).toBeVisible()
    await expect(craftingTab).toBeVisible()
    await expect(craftingTab).toBeEnabled()
  })

  test('non-craftable item shows disabled Crafting tab', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${RAW_ITEM_ID}`)
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await expect(craftingTab).toBeVisible()
    await expect(craftingTab).toBeDisabled()
  })

  test('Market tab is selected by default', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}`)
    const marketTab = page.locator('[role="tab"]', { hasText: 'Market' })
    await expect(marketTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('h2', { hasText: 'Cross-World Listings' })).toBeVisible()
  })

  test('clicking Crafting tab switches view', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}`)
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await craftingTab.click()
    await expect(craftingTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('h2', { hasText: 'Cross-World Listings' })).not.toBeVisible()
  })

  test('tab state persists in URL', async ({ page }) => {
    await mockExternalApis(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}?tab=crafting`)
    const craftingTab = page.locator('[role="tab"]', { hasText: 'Crafting' })
    await expect(craftingTab).toHaveAttribute('aria-selected', 'true')
  })
})

const CRAFT_API_RESPONSE = {
  root: {
    itemId: CRAFTABLE_ITEM_ID,
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
          amount: 3,
          action: 'buy',
          unitCost: 50,
          totalCost: 150,
          confidence: 0.88,
          marketPrice: 50,
          vendorPrice: null,
          craftCost: 200,
          marketWorld: '利維坦',
          recipe: {
            recipeId: 101,
            job: 10,
            level: 3,
            yields: 1,
            ingredients: [
              {
                itemId: 5111,
                amount: 2,
                action: 'vendor',
                unitCost: 5,
                totalCost: 10,
                confidence: 1.0,
                marketPrice: null,
                vendorPrice: 5,
                craftCost: null,
                marketWorld: null,
              },
            ],
          },
        },
        {
          itemId: 5111,
          amount: 4,
          action: 'vendor',
          unitCost: 5,
          totalCost: 20,
          confidence: 1.0,
          marketPrice: null,
          vendorPrice: 5,
          craftCost: null,
          marketWorld: null,
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

async function mockCraftApi(page: Page) {
  await page.route(`**/api/craft/${CRAFTABLE_ITEM_ID}`, route =>
    route.fulfill({ json: CRAFT_API_RESPONSE }),
  )
}

test.describe('Item detail page — crafting breakdown', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page)
    await mockCraftApi(page)
    await page.goto(`/item/${CRAFTABLE_ITEM_ID}?tab=crafting`)
  })

  test('shows recommendation in summary card', async ({ page }) => {
    await expect(page.locator('text=Recommendation: Craft')).toBeVisible()
  })

  test('shows craft cost and buy cheapest in summary', async ({ page }) => {
    await expect(page.locator('text=320').first()).toBeVisible()
    await expect(page.locator('text=500').first()).toBeVisible()
  })

  test('shows root node as craft with collapse arrow', async ({ page }) => {
    const rootNode = page.locator('[data-testid="craft-node"]').first()
    await expect(rootNode).toBeVisible()
    await expect(rootNode.locator('text=▼')).toBeVisible()
  })

  test('shows vendor leaf nodes without collapse arrow', async ({ page }) => {
    const vendorBadges = page.locator('text=vendor')
    await expect(vendorBadges.first()).toBeVisible()
  })

  test('buy node with recipe shows expand arrow', async ({ page }) => {
    const buyNode = page.locator('[data-testid="buy-recipe-node"]')
    await expect(buyNode).toBeVisible()
    await expect(buyNode.locator('text=▶')).toBeVisible()
  })

  test('clicking buy-with-recipe node expands it', async ({ page }) => {
    const buyNode = page.locator('[data-testid="buy-recipe-node"]')
    await buyNode.locator('text=▶').click()
    await expect(buyNode.locator('text=▼')).toBeVisible()
    const children = buyNode.locator('[data-testid="vendor-leaf"]')
    await expect(children).toBeVisible()
  })

  test('clicking expanded craft node collapses it', async ({ page }) => {
    const rootNode = page.locator('[data-testid="craft-node"]').first()
    await rootNode.locator('text=▼').click()
    await expect(rootNode.locator('text=▶')).toBeVisible()
  })

  test('shows confidence dots on market-priced nodes', async ({ page }) => {
    const dots = page.locator('[data-testid="confidence-dot"]')
    await expect(dots).toHaveCount(2)
  })

  test('shows overall confidence footer', async ({ page }) => {
    await expect(page.locator('text=Overall Confidence')).toBeVisible()
    await expect(page.locator('text=88%').first()).toBeVisible()
  })

  test('tree nodes show item names after metadata loads', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Bronze Ornamental Hammer/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Bronze Ingot/ })).toBeVisible()
  })
})
