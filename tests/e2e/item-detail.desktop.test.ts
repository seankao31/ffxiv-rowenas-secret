import { test, expect, type Page } from '@playwright/test'

const ITEM_ID = 2394

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

const MANY_LISTINGS_RESPONSE = {
  listings: Array.from({ length: 50 }, (_, i) => makeListing(i)),
}

const XIVAPI_RESPONSE = {
  rows: [{
    row_id: ITEM_ID,
    fields: {
      Name: 'Bronze Ornamental Hammer',
      Icon: { id: 0, path: '/i/052000/052653.tex', path_hr1: '/i/052000/052653_hr1.tex' },
    },
  }],
}

async function mockApi(page: Page) {
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
    route.fulfill({ json: MANY_LISTINGS_RESPONSE }),
  )
  await page.route('**/universalis.app/api/v2/history/**', route =>
    route.fulfill({ json: { entries: [] } }),
  )
}

test.describe('Item detail page (desktop layout)', () => {
  test('listings section scrolls independently without overlapping footer', async ({ page }) => {
    await mockApi(page)
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
})
