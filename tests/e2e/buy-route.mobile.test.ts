import { test, expect } from '@playwright/test'
import { mockArbitrageApi } from './fixtures/mock-arbitrage-api'

test.describe('Buy Route (mobile layout)', () => {
  test.beforeEach(async ({ page }) => {
    await mockArbitrageApi(page)
    await page.goto('/arbitrage')
    await expect(page.locator('table')).toBeVisible()

    // Select an item and open the modal
    await page.locator('table tbody tr').first().locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()
    await expect(page.locator('[data-testid="buy-route-modal"]')).toBeVisible()
  })

  test('tapping an item in modal marks it as bought', async ({ page }) => {
    const item = page.locator('[data-testid="route-item"]').first()
    await expect(item).toHaveAttribute('data-state', 'unchecked')
    await item.click()
    await expect(item).toHaveAttribute('data-state', 'bought')
  })

  test('modal item rows use button elements for touch compatibility', async ({ page }) => {
    // Unchecked items: primary tap target is a <button> inside the row
    const uncheckedItem = page.locator('[data-testid="route-item"][data-state="unchecked"]').first()
    const innerButton = uncheckedItem.locator(':scope > button').first()
    const tagName = await innerButton.evaluate(el => el.tagName.toLowerCase())
    expect(tagName).toBe('button')

    // Bought items: the entire row is a <button>
    await uncheckedItem.click()
    const boughtItem = page.locator('[data-testid="route-item"][data-state="bought"]').first()
    const boughtTag = await boughtItem.evaluate(el => el.tagName.toLowerCase())
    expect(boughtTag).toBe('button')
  })

  test('copy button is hidden in modal on mobile', async ({ page }) => {
    const modal = page.locator('[data-testid="buy-route-modal"]')
    const copyBtn = modal.locator('[data-testid="route-item"][data-state="unchecked"]').first().locator('button[aria-label="Copy item name"]')
    await expect(copyBtn).toBeHidden()
  })

  test('row height stays constant when marked bought, missing, and back to unchecked', async ({ page }) => {
    // Mobile's `flex-wrap` layout wraps the qty/price/confidence line to a new row
    // inside the unchecked state, so the unchecked→{bought,missing} transitions
    // follow a different code path than desktop. Guard height stability here too.
    const item = page.locator('[data-testid="route-item"]').first()
    await expect(item).toHaveAttribute('data-state', 'unchecked')
    const unchecked = await item.boundingBox()
    expect(unchecked).toBeTruthy()

    await item.locator('button[aria-label="Mark as missing"]').click()
    await expect(item).toHaveAttribute('data-state', 'missing')
    const missing = await item.boundingBox()
    expect(missing).toBeTruthy()
    expect(Math.abs(missing!.height - unchecked!.height)).toBeLessThanOrEqual(1)

    await item.locator('button[aria-label="Undo missing"]').click()
    await expect(item).toHaveAttribute('data-state', 'unchecked')
    await item.click()
    await expect(item).toHaveAttribute('data-state', 'bought')
    const bought = await item.boundingBox()
    expect(bought).toBeTruthy()
    expect(Math.abs(bought!.height - unchecked!.height)).toBeLessThanOrEqual(1)
  })

  test('linked row height stays constant across primary/alt toggle', async ({ page }) => {
    // Add a second selection so the modal contains a primary/alt linked pair,
    // then verify the dismissed (linked-partner-bought) transition doesn't shift
    // the linked row's height. The beforeEach already selected one item and opened
    // the modal; close it, add another selection, and reopen.
    await page.keyboard.press('Escape')
    await page.locator('table tbody tr').nth(1).locator('td:nth-child(3)').click()
    await page.locator('[data-testid="floating-action-bar"] button', { hasText: 'Plan Route' }).click()

    const allItems = page.locator('[data-testid="route-item"]')
    const count = await allItems.count()
    let primaryIndex = -1
    let altIndex = -1
    let itemName: string | null = null
    for (let i = 0; i < count; i++) {
      const row = allItems.nth(i)
      const isAlt = (await row.locator('.badge-warning', { hasText: 'alt' }).count()) > 0
      const name = (await row.locator('span').first().innerText()).trim()
      if (!isAlt && primaryIndex < 0) {
        primaryIndex = i
        itemName = name
      } else if (isAlt && itemName !== null && name === itemName) {
        altIndex = i
        break
      }
    }
    expect(primaryIndex).toBeGreaterThanOrEqual(0)
    expect(altIndex).toBeGreaterThanOrEqual(0)

    const primary = allItems.nth(primaryIndex)
    const alt = allItems.nth(altIndex)

    await expect(primary).toHaveAttribute('data-state', 'unchecked')
    const before = await primary.boundingBox()
    expect(before).toBeTruthy()

    await alt.click()
    await expect(primary).toHaveAttribute('data-state', 'dismissed')

    const after = await primary.boundingBox()
    expect(after).toBeTruthy()
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1)
  })

  test('close button has adequate tap target', async ({ page }) => {
    const closeBtn = page.locator('[data-testid="buy-route-modal"] button.btn[aria-label="Close route"]')
    const box = await closeBtn.boundingBox()
    expect(box).toBeTruthy()
    // 44px is the minimum recommended tap target per WCAG/Apple HIG
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})
