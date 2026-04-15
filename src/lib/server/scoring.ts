import type { ItemData, Opportunity, ThresholdParams } from '$lib/shared/types.ts'

export const HOME_WORLD_ID = 4030
export const MARKET_TAX = 0.05
// Time constants match spec pseudocode: exp(-age / τ)
// home τ=3h → at 3h, confidence≈0.368; at 6h≈0.135 (steep — financial risk)
// source τ=12h → at 12h, confidence≈0.368 (gentle — trip risk only)
export const HOME_TIME_CONSTANT_H = 3
export const SOURCE_TIME_CONSTANT_H = 12
export const MS_PER_HOUR = 3_600_000
// Turnover (liquidity) discount: penalises slow-selling items in the score.
// Items selling in ≤ IDEAL days get no penalty; beyond that, exponential decay with τ.
// τ=3 → at 3d to sell ≈ 51%, at 7d ≈ 14%.  Affects ranking only, not expectedDailyProfit.
const TURNOVER_IDEAL_DAYS = 1
const TURNOVER_TIME_CONSTANT_DAYS = 3

export function confidence(ageHours: number, timeConstantHours: number): number {
  return Math.exp(-ageHours / timeConstantHours)
}

export function scoreOpportunities(
  cache: Map<number, ItemData>,
  nameMap: Map<number, string>,
  params: ThresholdParams,
  vendorPrices?: Map<number, number>,
  vendorSellPrices?: Map<number, number>,
): Opportunity[] {
  const now = Date.now()
  const opportunities: Opportunity[] = []

  type WorldResult = {
    worldID: number
    worldName: string
    cheapestSource: number
    effectiveBuyPrice: number
    profitPerUnit: number
    sourceAgeHours: number
    sourceConf: number
    worldScore: number
    availableUnits: number
  }

  for (const item of cache.values()) {
    const allListings = params.hq ? item.listings.filter(l => l.hq) : item.listings

    // --- Home listings ---
    const homeListings = allListings.filter(l => l.worldID === HOME_WORLD_ID)

    const cheapestHomePrice = homeListings.length > 0
      ? Math.min(...homeListings.map(l => l.pricePerUnit))
      : Infinity

    // --- Total velocity (needed before history window + competitor count) ---
    const velocity = params.hq ? item.hqSaleVelocity : item.regularSaleVelocity
    if (velocity === 0) continue

    // --- Realistic sell price ---
    // Cap the expected sell price at the median of all available sale history
    // to avoid overestimating profit from inflated listing prices.
    // No time-window filter: the API already returns a bounded set (~20 entries),
    // and low-velocity items are naturally penalised by the scoring formula.
    const relevantHistory = params.hq
      ? item.recentHistory.filter(s => s.hq)
      : item.recentHistory
    let realisticSellPrice = cheapestHomePrice
    if (relevantHistory.length > 0) {
      const prices = relevantHistory.map(s => s.pricePerUnit).sort((a, b) => a - b)
      const medianPrice = prices[Math.floor(prices.length / 2)]!
      realisticSellPrice = Math.min(cheapestHomePrice, medianPrice)
    }
    // No sell price signal: no home listings and no sale history to derive a price from
    if (!isFinite(realisticSellPrice)) continue

    // --- Competitors relative to realistic sell price ---
    // Only count listings near our expected price as real competition.
    // A 200K listing is not competing with us if we plan to sell at 50K.
    const competitorListings = homeListings.filter(l =>
      l.pricePerUnit <= realisticSellPrice * params.price_threshold
    )
    const activeCompetitorCount = competitorListings.length
    const fairShareVelocity = velocity / (activeCompetitorCount + 1)

    // --- Turnover discount ---
    const daysToSell = 1 / fairShareVelocity
    const turnoverDiscount = Math.exp(
      -Math.max(0, daysToSell - TURNOVER_IDEAL_DAYS) / TURNOVER_TIME_CONSTANT_DAYS
    )

    // --- Home confidence ---
    const homeAgeHours = (now - item.homeLastUploadTime) / MS_PER_HOUR
    const homeConf = confidence(homeAgeHours, HOME_TIME_CONSTANT_H)

    // --- Per-source-world scoring ---
    const sourceListings = allListings.filter(l => l.worldID !== HOME_WORLD_ID)
    const worldIds = [...new Set(sourceListings.map(l => l.worldID))]
    const worldResults: WorldResult[] = []

    for (const worldID of worldIds) {
      const wListings = sourceListings.filter(l => l.worldID === worldID)
      const cheapestSource = Math.min(...wListings.map(l => l.pricePerUnit))
      const effectiveBuyPrice = cheapestSource * (1 + MARKET_TAX)
      const profitPerUnit = realisticSellPrice * (1 - MARKET_TAX) - effectiveBuyPrice
      if (profitPerUnit <= 0) continue

      const uploadTime = item.worldUploadTimes[worldID] ?? 0
      const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
      const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H)
      const worldScore = profitPerUnit * fairShareVelocity * homeConf * sourceConf * turnoverDiscount

      const availableUnits = wListings
        .filter(l => l.pricePerUnit === cheapestSource)
        .reduce((sum, l) => sum + l.quantity, 0)

      worldResults.push({
        worldID,
        worldName: wListings[0]!.worldName,
        cheapestSource,
        effectiveBuyPrice,
        profitPerUnit,
        sourceAgeHours,
        sourceConf,
        worldScore,
        availableUnits,
      })
    }

    // --- NPC vendor source ---
    const vendorPrice = vendorPrices?.get(item.itemID)
    if (vendorPrice !== undefined) {
      const npcProfit = realisticSellPrice * (1 - MARKET_TAX) - vendorPrice
      if (npcProfit > 0) {
        worldResults.push({
          worldID: 0,
          worldName: 'NPC',
          cheapestSource: vendorPrice,
          effectiveBuyPrice: vendorPrice,
          profitPerUnit: npcProfit,
          sourceAgeHours: 0,
          sourceConf: 1.0,
          // sourceConf omitted: NPC price is fixed (sourceConf=1.0), so multiplying is a no-op.
          worldScore: npcProfit * fairShareVelocity * homeConf * turnoverDiscount,
          // Infinity converts to sentinel -1 in the Opportunity output (line ~187).
          availableUnits: Infinity,
        })
      }
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
    const recommendedUnits = isFinite(best.availableUnits)
      ? Math.min(best.availableUnits, maxUnits)
      : maxUnits

    const opp: Opportunity = {
      itemID: item.itemID,
      itemName: nameMap.get(item.itemID) ?? `Item #${item.itemID}`,
      sellDestination: 'mb' as const,

      buyPrice: Math.round(best.effectiveBuyPrice),
      sellPrice: realisticSellPrice,
      // When no home listings exist, use realisticSellPrice (from history) to avoid Infinity in JSON
      listingPrice: isFinite(cheapestHomePrice) ? cheapestHomePrice : realisticSellPrice,
      profitPerUnit: Math.round(best.profitPerUnit),
      listingProfitPerUnit: isFinite(cheapestHomePrice)
        ? Math.round(cheapestHomePrice * (1 - MARKET_TAX) - best.effectiveBuyPrice)
        : Math.round(best.profitPerUnit),

      sourceWorld: best.worldName,
      sourceWorldID: best.worldID,

      availableUnits: isFinite(best.availableUnits) ? best.availableUnits : -1,
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
      opp.altBuyPrice = Math.round(alt.effectiveBuyPrice)
      opp.altExpectedDailyProfit = Math.round(alt.profitPerUnit * fairShareVelocity)
      opp.altSourceConfidence = Math.round(alt.sourceConf * 1000) / 1000
      opp.altSourceDataAgeHours = Math.round(alt.sourceAgeHours * 10) / 10
    }

    opportunities.push(opp)
  }

  // --- Vendor-sell pass ---
  // Evaluate selling to NPC vendor (PriceLow) as alternative to home-world MB.
  // All worlds (including home) are valid buy sources for vendor-sell.
  if (vendorSellPrices && vendorSellPrices.size > 0) {
    const mbByItem = new Map<number, number>()
    for (let i = 0; i < opportunities.length; i++) {
      mbByItem.set(opportunities[i]!.itemID, i)
    }

    for (const item of cache.values()) {
      const vendorSellPrice = vendorSellPrices.get(item.itemID)
      if (vendorSellPrice === undefined || vendorSellPrice <= 0) continue

      const allListings = params.hq ? item.listings.filter(l => l.hq) : item.listings
      const worldIds = [...new Set(allListings.map(l => l.worldID))]
      const worldResults: WorldResult[] = []

      for (const worldID of worldIds) {
        const wListings = allListings.filter(l => l.worldID === worldID)
        const cheapestSource = Math.min(...wListings.map(l => l.pricePerUnit))
        const effectiveBuyPrice = cheapestSource * (1 + MARKET_TAX)
        const profitPerUnit = vendorSellPrice - effectiveBuyPrice
        if (profitPerUnit <= 0) continue

        // Use authoritative homeLastUploadTime for home world (same as MB-sell pass).
        const uploadTime = worldID === HOME_WORLD_ID
          ? item.homeLastUploadTime
          : (item.worldUploadTimes[worldID] ?? 0)
        const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
        const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H)
        const worldScore = profitPerUnit * sourceConf

        const availableUnits = wListings
          .filter(l => l.pricePerUnit === cheapestSource)
          .reduce((sum, l) => sum + l.quantity, 0)

        worldResults.push({
          worldID,
          worldName: wListings[0]!.worldName,
          cheapestSource,
          effectiveBuyPrice,
          profitPerUnit,
          sourceAgeHours,
          sourceConf,
          worldScore,
          availableUnits,
        })
      }

      if (worldResults.length === 0) continue

      const best = worldResults.reduce((a, b) => b.worldScore > a.worldScore ? b : a)
      const altCandidates = worldResults.filter(w => w.worldID !== best.worldID)
      const alt = altCandidates.length > 0
        ? altCandidates.reduce((a, b) => b.profitPerUnit > a.profitPerUnit ? b : a)
        : null

      const velocity = params.hq ? item.hqSaleVelocity : item.regularSaleVelocity

      const opp: Opportunity = {
        itemID: item.itemID,
        itemName: nameMap.get(item.itemID) ?? `Item #${item.itemID}`,
        sellDestination: 'vendor',

        buyPrice: Math.round(best.effectiveBuyPrice),
        sellPrice: vendorSellPrice,
        // HACK: listingPrice/listingProfitPerUnit semantically mean "home MB listing"
        // but vendor-sell items often have no home listings at all. Setting them equal
        // to the vendor sell values suppresses the secondary line in OpportunityTable
        // (which only renders when listingPrice !== sellPrice). If we later want to
        // show "you could also list on MB for X" alongside vendor-sell, these fields
        // need real home MB data and the UI needs a proper vendor-sell branch.
        listingPrice: vendorSellPrice,
        profitPerUnit: Math.round(best.profitPerUnit),
        listingProfitPerUnit: Math.round(best.profitPerUnit),

        sourceWorld: best.worldName,
        sourceWorldID: best.worldID,

        availableUnits: best.availableUnits,
        // Vendor sells are instant — no days_of_supply cap. Buy everything profitable.
        recommendedUnits: best.availableUnits,
        expectedDailyProfit: Math.round(best.profitPerUnit * velocity),

        score: best.worldScore,

        homeDataAgeHours: 0,
        homeConfidence: 1.0,

        sourceDataAgeHours: Math.round(best.sourceAgeHours * 10) / 10,
        sourceConfidence: Math.round(best.sourceConf * 1000) / 1000,

        activeCompetitorCount: 0,
        fairShareVelocity: Math.round(velocity * 100) / 100,
      }

      if (alt) {
        opp.altSourceWorld = alt.worldName
        opp.altSourceWorldID = alt.worldID
        opp.altBuyPrice = Math.round(alt.effectiveBuyPrice)
        opp.altExpectedDailyProfit = Math.round(alt.profitPerUnit * velocity)
        opp.altSourceConfidence = Math.round(alt.sourceConf * 1000) / 1000
        opp.altSourceDataAgeHours = Math.round(alt.sourceAgeHours * 10) / 10
      }

      const existingIdx = mbByItem.get(item.itemID)
      if (existingIdx !== undefined) {
        if (opp.score > opportunities[existingIdx]!.score) {
          opportunities[existingIdx] = opp
        }
      } else {
        opportunities.push(opp)
      }
    }
  }

  opportunities.sort((a, b) => b.score - a.score)
  return opportunities.slice(0, params.limit)
}
