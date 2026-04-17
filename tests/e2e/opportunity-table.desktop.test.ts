import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('OpportunityTable (desktop only)', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()
  })

  test('sticky header covers body content during vertical scroll', async ({ page }) => {
    // Shrink the table container to force vertical overflow (the fixture has
    // only 6 rows), then scroll so body rows sit behind the header. The
    // topmost element at the corner header's center must belong to <thead>.
    // Desktop-only because the mobile sticky navbar overlaps the container
    // top, confounding elementFromPoint. Regression test for ENG-154.
    const container = page.locator('[data-testid=table-container]')
    await container.evaluate(c => {
      ;(c as HTMLElement).style.maxHeight = '200px'
      c.scrollTop = 120
    })
    expect(await container.evaluate(c => c.scrollTop)).toBeGreaterThan(0)

    const topIsHeader = await page.evaluate(() => {
      const th = document.querySelector('thead th:first-child')!
      const r = th.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return hit?.closest('thead') !== null
    })
    expect(topIsHeader).toBe(true)
  })

  // WebKit does not support context.grantPermissions for clipboard-write
  test('copy button copies item name to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('button[aria-label="Copy item name"]').click()

    await expect(firstRow.locator('[data-lucide="check"]')).toBeVisible()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe('Alpha Draught')

    await expect(firstRow.locator('[data-lucide="copy"]')).toBeVisible({ timeout: 3000 })
  })
})
