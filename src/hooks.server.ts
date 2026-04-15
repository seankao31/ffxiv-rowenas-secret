import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices, fetchVendorSellPrices } from '$lib/server/vendors'
import { initRecipes } from '$lib/server/recipes'
import { setVendorPrices, setVendorSellPrices, settleVendorPrices, settleVendorSellPrices } from '$lib/server/cache'
import { seedFixtureData } from '$lib/server/fixtures/seed'

export async function init() {
  // Recipe data and vendor prices load concurrently (both are independent).
  // Recipe data is local disk I/O — fast and must succeed.
  // If XIVAPI is down after retries, the app runs without vendor arbitrage data.
  const recipePromise = initRecipes().catch(err => {
    console.error('[server] Recipe loading failed:', err)
    process.exit(1)
  })

  fetchVendorPrices()
    .then(prices => {
      if (prices.size > 0) setVendorPrices(prices)
      else settleVendorPrices()  // setVendorPrices is skipped, but waiters must not block forever
    })
    .catch(err => {
      console.error('[server] Vendor price fetch failed after retries:', err)
      settleVendorPrices()
    })

  fetchVendorSellPrices()
    .then(prices => {
      if (prices.size > 0) setVendorSellPrices(prices)
      else settleVendorSellPrices()  // same rationale as settleVendorPrices above
    })
    .catch(err => {
      console.error('[server] Vendor sell price fetch failed:', err)
      settleVendorSellPrices()
    })

  await recipePromise

  if (process.env['FIXTURE_DATA']) {
    seedFixtureData()
  } else {
    startScanner().catch(err => {
      console.error('[server] Scanner crashed:', err)
      process.exit(1)
    })
  }
}
