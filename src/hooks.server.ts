import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices } from '$lib/server/vendors'
import { setVendorPrices } from '$lib/server/cache'

export async function init() {
  // Vendor prices and scanner load concurrently.
  // If XIVAPI is down after retries, the app runs without vendor arbitrage data.
  fetchVendorPrices()
    .then(prices => {
      if (prices.size > 0) setVendorPrices(prices)
    })
    .catch(err => {
      console.error('[server] Vendor price fetch failed after retries:', err)
    })

  startScanner().catch(err => {
    console.error('[server] Scanner crashed:', err)
    process.exit(1)
  })
}
