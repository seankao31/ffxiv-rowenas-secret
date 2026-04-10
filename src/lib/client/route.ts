import type { Opportunity } from '$lib/shared/types'

export type RouteItemState = 'unchecked' | 'bought' | 'missing'

export type RouteItem = {
  itemID: number
  itemName: string
  buyPrice: number
  recommendedUnits: number
  score: number
  sourceConfidence: number
  sourceDataAgeHours: number
  profitPerUnit: number
  isAlt: boolean
  primaryWorld?: string
  primaryBuyPrice?: number
}

export type RouteWorldGroup = {
  world: string
  isPrimaryGroup: boolean
  items: RouteItem[]
}

export function buildRoute(opportunities: Opportunity[]): RouteWorldGroup[] {
  const groups = new Map<string, { isPrimary: boolean; items: RouteItem[] }>()

  // Step 1: Place each opportunity under its primary source world
  for (const opp of opportunities) {
    if (!groups.has(opp.sourceWorld)) {
      groups.set(opp.sourceWorld, { isPrimary: true, items: [] })
    }
    const group = groups.get(opp.sourceWorld)!
    group.items.push({
      itemID: opp.itemID,
      itemName: opp.itemName,
      buyPrice: opp.buyPrice,
      recommendedUnits: opp.recommendedUnits,
      score: opp.score,
      sourceConfidence: opp.sourceConfidence,
      sourceDataAgeHours: opp.sourceDataAgeHours,
      profitPerUnit: opp.profitPerUnit,
      isAlt: false,
    })
  }

  // Step 2: Attach alt entries to their alt world group
  for (const opp of opportunities) {
    if (!opp.altSourceWorld || opp.altSourceWorld === opp.sourceWorld || opp.altBuyPrice === undefined) {
      continue
    }
    if (!groups.has(opp.altSourceWorld)) {
      groups.set(opp.altSourceWorld, { isPrimary: false, items: [] })
    }
    const group = groups.get(opp.altSourceWorld)!
    group.items.push({
      itemID: opp.itemID,
      itemName: opp.itemName,
      buyPrice: opp.altBuyPrice,
      recommendedUnits: opp.recommendedUnits,
      score: opp.score,
      sourceConfidence: opp.altSourceConfidence ?? opp.sourceConfidence,
      sourceDataAgeHours: opp.altSourceDataAgeHours ?? opp.sourceDataAgeHours,
      profitPerUnit: opp.profitPerUnit,
      isAlt: true,
      primaryWorld: opp.sourceWorld,
      primaryBuyPrice: opp.buyPrice,
    })
  }

  // Step 3: Sort items within each group — primaries first (by score desc), then alts (by score desc)
  for (const group of groups.values()) {
    group.items.sort((a, b) => {
      if (a.isAlt !== b.isAlt) return a.isAlt ? 1 : -1
      return b.score - a.score
    })
  }

  // Step 4: Build result — primary groups first (by item count desc), then alt-only (by item count desc)
  const primaryGroups: RouteWorldGroup[] = []
  const altOnlyGroups: RouteWorldGroup[] = []

  for (const [world, group] of groups) {
    const routeGroup: RouteWorldGroup = {
      world,
      isPrimaryGroup: group.isPrimary,
      items: group.items,
    }
    if (group.isPrimary) {
      primaryGroups.push(routeGroup)
    } else {
      altOnlyGroups.push(routeGroup)
    }
  }

  // Order primary groups by their *primary* row count — alt rows are
  // satellites of items rooted in other worlds and shouldn't inflate rank.
  const primaryRowCount = (g: RouteWorldGroup) => g.items.filter(i => !i.isAlt).length
  primaryGroups.sort((a, b) => primaryRowCount(b) - primaryRowCount(a))
  altOnlyGroups.sort((a, b) => b.items.length - a.items.length)

  return [...primaryGroups, ...altOnlyGroups]
}
