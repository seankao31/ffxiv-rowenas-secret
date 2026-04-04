import { startScanner } from '$lib/server/scanner'

export async function init() {
  startScanner().catch(err => {
    console.error('[server] Scanner crashed:', err)
    process.exit(1)
  })
}
