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

const XIVAPI_RESPONSE = {
  rows: [{
    row_id: ITEM_ID,
    fields: {
      Name: 'Bronze Ornamental Hammer',
      Icon: { id: 0, path: '/i/052000/052653.tex', path_hr1: '/i/052000/052653_hr1.tex' },
    },
  }],
}

const LISTINGS_RESPONSE = {
  listings: Array.from({ length: 50 }, (_, i) => makeListing(i)),
}

const HISTORY_RESPONSE = {
  entries: Array.from({ length: 30 }, (_, i) => makeSaleEntry(i)),
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
    route.fulfill({ json: LISTINGS_RESPONSE }),
  )
  await page.route('**/universalis.app/api/v2/history/**', route =>
    route.fulfill({ json: HISTORY_RESPONSE }),
  )
}

test.describe('Item detail page (mobile layout)', () => {
  test('page scrolls naturally instead of constraining viewport', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)
    await expect(page.locator('table tbody tr').first()).toBeVisible()

    // The root layout container should NOT have overflow hidden on mobile
    // SvelteKit wraps in a #app div; our layout div is inside it
    const root = page.locator('body > div > div').first()
    const overflow = await root.evaluate(el => getComputedStyle(el).overflow)
    expect(overflow).not.toBe('hidden')
  })

  test('listings table caps at 10 rows with show-more button', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const rows = listingsCard.locator('table tbody tr')
    await expect(rows).toHaveCount(10)

    const showMore = listingsCard.locator('button', { hasText: 'Show more' })
    await expect(showMore).toBeVisible()
    await expect(showMore).toContainText('40 remaining')
  })

  test('clicking show-more on listings reveals more rows', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const showMore = listingsCard.locator('button', { hasText: 'Show more' })
    await expect(showMore).toBeVisible()

    await showMore.click()
    const rows = listingsCard.locator('table tbody tr')
    await expect(rows).toHaveCount(20)
    await expect(showMore).toContainText('30 remaining')
  })

  test('history table caps at 10 rows with show-more button', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    const table = historyCard.locator('table')
    await expect(table).toBeVisible()
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(10)

    const showMore = historyCard.locator('button', { hasText: 'Show more' })
    await expect(showMore).toBeVisible()
    await expect(showMore).toContainText('20 remaining')
  })

  test('clicking show-more on history reveals more rows', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const historyCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Sale History' }) })
    const showMore = historyCard.locator('button', { hasText: 'Show more' })
    await expect(showMore).toBeVisible()

    await showMore.click()
    const rows = historyCard.locator('table tbody tr')
    await expect(rows).toHaveCount(20)
    await expect(showMore).toContainText('10 remaining')

    // Click again to reveal all — button should disappear
    await showMore.click()
    await expect(historyCard.locator('table tbody tr')).toHaveCount(30)
    await expect(showMore).not.toBeVisible()
  })

  test('footer is reachable by scrolling on mobile', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)
    await expect(page.locator('table tbody tr').first()).toBeVisible()

    const footer = page.locator('footer')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeInViewport()
  })

  test('price statistics section is visible on mobile', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const statsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Price Statistics' }) })
    await statsCard.scrollIntoViewIfNeeded()
    await expect(statsCard).toBeVisible()
  })

  test('changing world filter resets show-more pagination', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/item/${ITEM_ID}`)

    const listingsCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Cross-World Listings' }) })
    const showMore = listingsCard.locator('button', { hasText: 'Show more' })
    await expect(showMore).toBeVisible()

    // Expand to 20 rows
    await showMore.click()
    await expect(listingsCard.locator('table tbody tr')).toHaveCount(20)

    // Change world filter — pagination should reset
    const select = page.locator('select')
    await select.selectOption('伊弗利特')
    // 50 listings cycle 3 worlds, so 伊弗利特 gets indices 0,3,6,...
    // = 17 listings. With cap reset to 10, should see 10.
    const rows = listingsCard.locator('table tbody tr')
    await expect(rows).toHaveCount(10)
  })
})
