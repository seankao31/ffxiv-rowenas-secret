import { startScanner } from '$lib/server/scanner'
import { fetchVendorPrices } from '$lib/server/vendors'
import { setVendorPrices } from '$lib/server/cache'

export async function init() {
  // Fire-and-forget: vendor prices are non-critical and must not block scanner startup.
  // If XIVAPI is down, the app runs without NPC arbitrage (empty vendor map).
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
