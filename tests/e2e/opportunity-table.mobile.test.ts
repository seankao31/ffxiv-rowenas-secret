import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('opportunity table mobile layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('item column stays visible while scrolling table horizontally', async ({ page }) => {
    const table = page.locator('table')
    const firstItemLink = table.locator('tbody tr:first-child td:first-child a')

    await expect(firstItemLink).toBeVisible()

    const container = page.locator('[data-testid="table-container"]')
    await container.evaluate(el => { el.scrollLeft = 300 })

    await expect(firstItemLink).toBeInViewport()
  })

  test('table scrolls horizontally on mobile', async ({ page }) => {
    const container = page.locator('[data-testid="table-container"]')
    const scrollWidth = await container.evaluate(el => el.scrollWidth)
    const clientWidth = await container.evaluate(el => el.clientWidth)
    expect(scrollWidth).toBeGreaterThan(clientWidth)
  })

  test('threshold controls stack vertically on mobile', async ({ page }) => {
    await page.click('text=Scan Parameters')
    const container = page.locator('[data-testid="threshold-controls-body"]')
    await expect(container).toBeVisible()
    const labels = container.locator('label')
    const first = await labels.nth(0).boundingBox()
    const second = await labels.nth(1).boundingBox()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second!.y).toBeGreaterThan(first!.y + first!.height / 2)
  })
})
