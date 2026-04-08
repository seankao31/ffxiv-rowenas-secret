import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices } from '$lib/server/vendors'
import { setVendorPrices } from '$lib/server/cache'

export async function init() {
  // Fetch vendor prices (non-blocking for scanner — graceful degradation if XIVAPI is down)
  fetchVendorPrices()
    .then(prices => {
      if (prices.size > 0) setVendorPrices(prices)
    })
    .catch(err => {
      console.warn('[server] Vendor price fetch failed:', err)
    })

  startScanner().catch(err => {
    console.error('[server] Scanner crashed:', err)
    process.exit(1)
  })
}
