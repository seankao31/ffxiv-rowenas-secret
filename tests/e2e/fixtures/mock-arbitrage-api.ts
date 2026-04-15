import type { Page } from '@playwright/test'
import { opportunities, meta } from './opportunities'

export async function mockArbitrageApi(page: Page) {
  await page.route('**/api/opportunities**', async route => {
    await route.fulfill({ json: { opportunities, meta } })
  })
  await page.route('**/v2.xivapi.com/**', route => route.fulfill({ json: { rows: [] } }))
  await page.route('**/garlandtools.org/**/data.json', route => route.fulfill({ json: { locationIndex: {} } }))
  await page.route('**/garlandtools.org/**/get.php**', route => route.fulfill({ json: { item: { vendors: [] }, partials: [] } }))
}
