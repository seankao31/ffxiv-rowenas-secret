export type Listing = {
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  lastReviewTime: number  // unix ms — converted from API's seconds on ingestion
  hq: boolean
}

export type Sale = {
  pricePerUnit: number
  quantity: number
  worldID: number
  worldName: string
  timestamp: number       // unix ms (converted from API seconds at ingest)
  hq: boolean
  buyerName: string | null
}

export type SaleRecord = {
  pricePerUnit: number
  quantity: number
  timestamp: number
  hq: boolean
}

export type ItemData = {
  itemID: number
  // worldID → unix ms. Per-world timestamp of when market data was last uploaded for this item.
  // From Universalis worldUploadTimes (DC queries) or synthesized from lastUploadTime (per-world queries).
  // Only worlds that have at least one listing in Phase 1 appear here.
  worldUploadTimes: Record<number, number>
  // Authoritative home freshness from Phase 2 lastUploadTime.
  // Falls back to worldUploadTimes[4030] if Phase 2 returns 0 (sold-out board).
  homeLastUploadTime: number
  listings: Listing[]             // all worlds in DC (Phase 1)
  regularSaleVelocity: number     // 利維坦-specific, HQ+NQ combined (Phase 2)
  hqSaleVelocity: number          // 利維坦-specific, HQ only (Phase 2)
  recentHistory: SaleRecord[]     // 利維坦-specific (Phase 2)
}

export type ScanMeta = {
  scanCompletedAt: number           // unix ms; 0 = no scan complete yet
  itemsScanned: number
  itemsWithOpportunities: number
  nextScanEstimatedAt: number       // unix ms
}

export type ScanProgress = {
  phase: string                     // e.g. "Phase 1: 利維坦" or "Phase 2: home world"
  completedBatches: number
  totalBatches: number              // total across entire scan cycle
}

export type ThresholdParams = {
  price_threshold: number           // multiplier, default 2.0
  listing_staleness_hours: number   // default 48
  days_of_supply: number            // default 3
  limit: number                     // default 50, max 200
  hq: boolean                       // default false
}

export type Opportunity = {
  itemID: number
  itemName: string

  buyPrice: number
  sellPrice: number        // realistic sell price: min(cheapest listing, median recent sale)
  listingPrice: number     // cheapest active listing on home world (before history adjustment)
  profitPerUnit: number
  listingProfitPerUnit: number  // profit if sold at current lowest listing price (before history cap)

  sourceWorld: string
  sourceWorldID: number

  altSourceWorld?: string
  altSourceWorldID?: number
  altBuyPrice?: number
  altExpectedDailyProfit?: number
  altSourceConfidence?: number
  altSourceDataAgeHours?: number

  availableUnits: number
  recommendedUnits: number
  expectedDailyProfit: number

  score: number

  homeDataAgeHours: number
  homeConfidence: number

  sourceDataAgeHours: number
  sourceConfidence: number

  activeCompetitorCount: number
  fairShareVelocity: number

  sellDestination: 'mb' | 'vendor'
}

export type CraftAction = 'craft' | 'buy' | 'vendor'

export type CraftingNode = {
  itemId: number
  amount: number
  action: CraftAction
  unitCost: number
  totalCost: number
  confidence: number
  recipe?: {
    recipeId: number
    job: number
    level: number
    yields: number
    ingredients: CraftingNode[]
  }
  marketPrice: number | null
  vendorPrice: number | null
  craftCost: number | null
  marketWorld: string | null
}

export type CraftingResult = {
  root: CraftingNode
  totalCost: number
  confidence: number
  cheapestListing: { price: number; world: string } | null
  realisticSellPrice: number | null
  profitVsBuy: number | null
  profitVsSell: number | null
}

export type CraftCostEntry = {
  itemId: number       // result item ID
  recipeId: number     // recipe that was cheapest
  job: number          // crafter job for that recipe
  level: number        // required job level
  craftCost: number    // per-unit cost via optimal craft tree
  confidence: number   // min confidence across all ingredients
}
