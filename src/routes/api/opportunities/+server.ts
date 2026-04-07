import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAllItems, getNameMap, getVendorPrices, isCacheReady, getScanMeta, setScanMeta, getScanProgress } from '$lib/server/cache'
import { scoreOpportunities } from '$lib/server/scoring'
import { parseThresholds } from '$lib/server/thresholds'

export const GET: RequestHandler = ({ request, url }) => {
  if (!isCacheReady()) {
    return json({ ready: false, progress: getScanProgress() }, { status: 202 })
  }

  const query = Object.fromEntries(url.searchParams)
  const params = parseThresholds(query)
  if ('error' in params) {
    return json({ error: params.error }, { status: 400 })
  }

  const meta = getScanMeta()
  const vendorCount = getVendorPrices().size
  const etag = `"${meta.scanCompletedAt}-${vendorCount}-${params.price_threshold}-${params.listing_staleness_hours}-${params.days_of_supply}-${params.limit}-${params.hq}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 })
  }

  try {
    const opportunities = scoreOpportunities(getAllItems(), getNameMap(), params, getVendorPrices())
    setScanMeta({ ...meta, itemsWithOpportunities: opportunities.length })

    return json(
      { opportunities, meta: getScanMeta() },
      { headers: { ETag: etag } },
    )
  } catch (err) {
    console.error('[api] Scoring error:', err)
    return json({ error: 'Internal scoring error' }, { status: 500 })
  }
}
