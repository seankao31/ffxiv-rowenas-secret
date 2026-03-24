// src/server/api.ts
import { Router } from 'express'
import { getAllItems, getNameMap, isCacheReady, getScanMeta, setScanMeta, getScanProgress } from './cache.ts'
import { scoreOpportunities } from './scoring.ts'
import { rateLimiter } from './universalis.ts'
import type { ThresholdParams } from '../shared/types.ts'

export const router = Router()

const ADMIN_SECRET = process.env['ADMIN_SECRET']

router.put('/admin/rate-limit', (req, res) => {
  if (!ADMIN_SECRET) {
    res.status(404).end()
    return
  }
  if (req.headers['authorization'] !== `Bearer ${ADMIN_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const { ratePerSecond } = req.body as { ratePerSecond?: number }
  if (typeof ratePerSecond !== 'number' || ratePerSecond < 1 || ratePerSecond > 25) {
    res.status(400).json({ error: 'ratePerSecond must be between 1 and 25' })
    return
  }
  const previous = rateLimiter.getRate()
  rateLimiter.setRate(ratePerSecond)
  console.log(`[admin] Rate limit changed: ${previous} → ${ratePerSecond} req/s`)
  res.json({ previous, current: ratePerSecond })
})

function parseThresholds(query: Record<string, unknown>): ThresholdParams | { error: string } {
  const price_threshold = query['price_threshold'] !== undefined
    ? Number(query['price_threshold']) : 2.0
  const listing_staleness_hours = query['listing_staleness_hours'] !== undefined
    ? Number(query['listing_staleness_hours']) : 48
  const days_of_supply = query['days_of_supply'] !== undefined
    ? Number(query['days_of_supply']) : 3
  const limit = query['limit'] !== undefined ? Number(query['limit']) : 50
  const hq = query['hq'] === 'true'

  if (isNaN(price_threshold) || price_threshold < 1.0 || price_threshold > 10.0)
    return { error: 'price_threshold must be between 1.0 and 10.0' }
  if (isNaN(listing_staleness_hours) || listing_staleness_hours < 1 || listing_staleness_hours > 720)
    return { error: 'listing_staleness_hours must be between 1 and 720' }
  if (isNaN(days_of_supply) || days_of_supply < 1 || days_of_supply > 30)
    return { error: 'days_of_supply must be between 1 and 30' }
  if (isNaN(limit) || limit < 1 || limit > 200)
    return { error: 'limit must be between 1 and 200' }

  return { price_threshold, listing_staleness_hours, days_of_supply, limit, hq }
}

router.get('/opportunities', (req, res) => {
  if (!isCacheReady()) {
    res.status(202).json({ ready: false, progress: getScanProgress() })
    return
  }

  const params = parseThresholds(req.query as Record<string, unknown>)
  if ('error' in params) {
    res.status(400).json({ error: params.error })
    return
  }

  try {
    const opportunities = scoreOpportunities(getAllItems(), getNameMap(), params)

    // Keep itemsWithOpportunities current in meta
    const meta = getScanMeta()
    setScanMeta({ ...meta, itemsWithOpportunities: opportunities.length })

    res.json({ opportunities, meta: getScanMeta() })
  } catch (err) {
    console.error('[api] Scoring error:', err)
    res.status(500).json({ error: 'Internal scoring error' })
  }
})
