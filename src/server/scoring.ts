// src/server/scoring.ts
import type { ItemData, Opportunity, ThresholdParams } from '../shared/types.ts'

const HOME_WORLD_ID = 4030
const MARKET_TAX = 0.05
// Time constants match spec pseudocode: exp(-age / τ)
// home τ=3h → at 3h, confidence≈0.368; at 6h≈0.135 (steep — financial risk)
// source τ=12h → at 12h, confidence≈0.368 (gentle — trip risk only)
const HOME_TIME_CONSTANT_H = 3
const SOURCE_TIME_CONSTANT_H = 12
const MS_PER_HOUR = 3_600_000

function confidence(ageHours: number, timeConstantHours: number): number {
  return Math.exp(-ageHours / timeConstantHours)
}

export function scoreOpportunities(
  cache: Map<number, ItemData>,
  nameMap: Map<number, string>,
  params: ThresholdParams
): Opportunity[] {
  const now = Date.now()
  const stalenessCutoff = now - params.listing_staleness_hours * MS_PER_HOUR
  const opportunities: Opportunity[] = []

  for (const item of cache.values()) {
    const allListings = params.hq ? item.listings.filter(l => l.hq) : item.listings

    // --- Active home listings ---
    const homeListings = allListings.filter(l => l.worldID === HOME_WORLD_ID)
    if (homeListings.length === 0) continue

    const minHomePrice = Math.min(...homeListings.map(l => l.pricePerUnit))
    const activeHomeListings = homeListings.filter(l =>
      l.pricePerUnit <= minHomePrice * params.price_threshold &&
      l.lastReviewTime >= stalenessCutoff
    )
    if (activeHomeListings.length === 0) continue

    const cheapestHomePrice = Math.min(...activeHomeListings.map(l => l.pricePerUnit))
    const activeCompetitorCount = activeHomeListings.length

    // --- Velocity ---
    const velocity = params.hq ? item.hqSaleVelocity : item.regularSaleVelocity
    if (velocity === 0) continue
    const fairShareVelocity = velocity / (activeCompetitorCount + 1)

    // --- Home confidence ---
    const homeAgeHours = (now - item.homeLastUploadTime) / MS_PER_HOUR
    const homeConf = confidence(homeAgeHours, HOME_TIME_CONSTANT_H)

    // --- Per-source-world scoring ---
    type WorldResult = {
      worldID: number
      worldName: string
      cheapestSource: number
      profitPerUnit: number
      sourceAgeHours: number
      sourceConf: number
      worldScore: number
      availableUnits: number
    }

    const sourceListings = allListings.filter(l => l.worldID !== HOME_WORLD_ID)
    const worldIds = [...new Set(sourceListings.map(l => l.worldID))]
    const worldResults: WorldResult[] = []

    for (const worldID of worldIds) {
      const wListings = sourceListings.filter(l => l.worldID === worldID)
      const minSrcPrice = Math.min(...wListings.map(l => l.pricePerUnit))
      const activeSrc = wListings.filter(l =>
        l.pricePerUnit <= minSrcPrice * params.price_threshold &&
        l.lastReviewTime >= stalenessCutoff
      )
      if (activeSrc.length === 0) continue

      const cheapestSource = Math.min(...activeSrc.map(l => l.pricePerUnit))
      const profitPerUnit = cheapestHomePrice * (1 - MARKET_TAX) - cheapestSource
      if (profitPerUnit <= 0) continue

      const uploadTime = item.worldUploadTimes[worldID] ?? 0
      const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
      const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H)
      const worldScore = profitPerUnit * fairShareVelocity * homeConf * sourceConf

      // Count only units at the exact cheapest price (multiple retainers at same price all count)
      const availableUnits = activeSrc
        .filter(l => l.pricePerUnit === cheapestSource)
        .reduce((sum, l) => sum + l.quantity, 0)

      worldResults.push({
        worldID,
        worldName: wListings[0]!.worldName,
        cheapestSource,
        profitPerUnit,
        sourceAgeHours,
        sourceConf,
        worldScore,
        availableUnits,
      })
    }

    if (worldResults.length === 0) continue

    // Best = highest confidence-adjusted score
    const best = worldResults.reduce((a, b) => b.worldScore > a.worldScore ? b : a)

    // Alt = highest raw profitPerUnit excluding best world
    const altCandidates = worldResults.filter(w => w.worldID !== best.worldID)
    const alt = altCandidates.length > 0
      ? altCandidates.reduce((a, b) => b.profitPerUnit > a.profitPerUnit ? b : a)
      : null

    const maxUnits = Math.ceil(fairShareVelocity * params.days_of_supply)
    const recommendedUnits = Math.min(best.availableUnits, maxUnits)

    const opp: Opportunity = {
      itemID: item.itemID,
      itemName: nameMap.get(item.itemID) ?? `Item #${item.itemID}`,

      buyPrice: best.cheapestSource,
      sellPrice: cheapestHomePrice,
      profitPerUnit: Math.round(best.profitPerUnit),
      tax: Math.round(cheapestHomePrice * MARKET_TAX),

      sourceWorld: best.worldName,
      sourceWorldID: best.worldID,

      availableUnits: best.availableUnits,
      recommendedUnits,
      expectedDailyProfit: Math.round(best.profitPerUnit * fairShareVelocity),

      score: best.worldScore,

      homeDataAgeHours: Math.round(homeAgeHours * 10) / 10,
      homeConfidence: Math.round(homeConf * 1000) / 1000,

      sourceDataAgeHours: Math.round(best.sourceAgeHours * 10) / 10,
      sourceConfidence: Math.round(best.sourceConf * 1000) / 1000,

      activeCompetitorCount,
      fairShareVelocity: Math.round(fairShareVelocity * 100) / 100,
    }

    if (alt) {
      opp.altSourceWorld = alt.worldName
      opp.altSourceWorldID = alt.worldID
      opp.altBuyPrice = alt.cheapestSource
      opp.altExpectedDailyProfit = Math.round(alt.profitPerUnit * fairShareVelocity)
      opp.altSourceConfidence = Math.round(alt.sourceConf * 1000) / 1000
      opp.altSourceDataAgeHours = Math.round(alt.sourceAgeHours * 10) / 10
    }

    opportunities.push(opp)
  }

  opportunities.sort((a, b) => b.score - a.score)
  return opportunities.slice(0, params.limit)
}
