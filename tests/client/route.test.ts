import { describe, it, expect } from 'vitest'
import { buildRoute } from '$lib/client/route'
import type { Opportunity } from '$lib/shared/types'

function opp(overrides: Partial<Opportunity> & Pick<Opportunity, 'itemID' | 'sourceWorld' | 'score'>): Opportunity {
  return {
    itemName: `Item ${overrides.itemID}`,
    buyPrice: 1000, sellPrice: 2000, listingPrice: 2000,
    profitPerUnit: 900, listingProfitPerUnit: 900,
    sourceWorldID: 1,
    availableUnits: 10, recommendedUnits: 5,
    expectedDailyProfit: 500,
    homeDataAgeHours: 1, homeConfidence: 0.9,
    sourceDataAgeHours: 0.5, sourceConfidence: 0.95,
    activeCompetitorCount: 2, fairShareVelocity: 3,
    ...overrides,
  }
}

describe('buildRoute', () => {
  it('groups items by sourceWorld', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90 }),
      opp({ itemID: 2, sourceWorld: 'Ixion', score: 80 }),
      opp({ itemID: 3, sourceWorld: 'Carbuncle', score: 70 }),
    ]
    const route = buildRoute(selected)

    expect(route).toHaveLength(2)
    expect(route[0]!.world).toBe('Ixion')
    expect(route[0]!.items).toHaveLength(2)
    expect(route[1]!.world).toBe('Carbuncle')
    expect(route[1]!.items).toHaveLength(1)
  })

  it('sorts world groups by primary item count descending', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Unicorn', score: 90 }),
      opp({ itemID: 2, sourceWorld: 'Ixion', score: 80 }),
      opp({ itemID: 3, sourceWorld: 'Ixion', score: 70 }),
      opp({ itemID: 4, sourceWorld: 'Ixion', score: 60 }),
    ]
    const route = buildRoute(selected)

    expect(route[0]!.world).toBe('Ixion')
    expect(route[0]!.items).toHaveLength(3)
    expect(route[1]!.world).toBe('Unicorn')
  })

  it('sorts items within a group by score descending', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 50 }),
      opp({ itemID: 2, sourceWorld: 'Ixion', score: 90 }),
      opp({ itemID: 3, sourceWorld: 'Ixion', score: 70 }),
    ]
    const route = buildRoute(selected)
    const scores = route[0]!.items.map(i => i.score)

    expect(scores).toEqual([90, 70, 50])
  })

  it('attaches alt entries under the alt world group', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90,
            altSourceWorld: 'Carbuncle', altBuyPrice: 1100,
            altSourceConfidence: 0.9, altSourceDataAgeHours: 1 }),
      opp({ itemID: 2, sourceWorld: 'Carbuncle', score: 80 }),
    ]
    const route = buildRoute(selected)

    const carbuncle = route.find(g => g.world === 'Carbuncle')!
    expect(carbuncle.items).toHaveLength(2)
    const altItem = carbuncle.items.find(i => i.isAlt)!
    expect(altItem.itemID).toBe(1)
    expect(altItem.buyPrice).toBe(1100)
    expect(altItem.primaryWorld).toBe('Ixion')
    expect(altItem.primaryBuyPrice).toBe(1000)
  })

  it('creates alt-only world group when alt world has no primary items', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90,
            altSourceWorld: 'Unicorn', altBuyPrice: 1200,
            altSourceConfidence: 0.85, altSourceDataAgeHours: 2 }),
    ]
    const route = buildRoute(selected)

    expect(route).toHaveLength(2)
    expect(route[0]!.world).toBe('Ixion')
    expect(route[0]!.isPrimaryGroup).toBe(true)
    expect(route[1]!.world).toBe('Unicorn')
    expect(route[1]!.isPrimaryGroup).toBe(false)
    expect(route[1]!.items[0]!.isAlt).toBe(true)
  })

  it('sorts primary groups by primary row count, not total row count with alts', () => {
    // Items 1 and 2 are primary on Ixion, with alts on Carbuncle.
    // Item 3 is primary on Carbuncle (no alt).
    // Ixion has 2 primaries + 0 alts = 2 total.
    // Carbuncle has 1 primary + 2 alts = 3 total.
    // Ixion must rank ahead because primary count, not total count, decides order.
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90,
            altSourceWorld: 'Carbuncle', altBuyPrice: 1100,
            altSourceConfidence: 0.9, altSourceDataAgeHours: 1 }),
      opp({ itemID: 2, sourceWorld: 'Ixion', score: 80,
            altSourceWorld: 'Carbuncle', altBuyPrice: 1100,
            altSourceConfidence: 0.9, altSourceDataAgeHours: 1 }),
      opp({ itemID: 3, sourceWorld: 'Carbuncle', score: 70 }),
    ]
    const route = buildRoute(selected)

    expect(route).toHaveLength(2)
    expect(route[0]!.world).toBe('Ixion')
    expect(route[1]!.world).toBe('Carbuncle')
  })

  it('places primary groups before alt-only groups', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90,
            altSourceWorld: 'Aaa-First-Alpha', altBuyPrice: 1200,
            altSourceConfidence: 0.85, altSourceDataAgeHours: 2 }),
    ]
    const route = buildRoute(selected)

    // Ixion (primary) should come before Aaa-First-Alpha (alt-only)
    // even though alphabetically Aaa comes first
    expect(route[0]!.world).toBe('Ixion')
    expect(route[1]!.world).toBe('Aaa-First-Alpha')
  })

  it('skips alt entry when altSourceWorld === sourceWorld', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90,
            altSourceWorld: 'Ixion', altBuyPrice: 1100 }),
    ]
    const route = buildRoute(selected)

    expect(route).toHaveLength(1)
    expect(route[0]!.items).toHaveLength(1)
    expect(route[0]!.items[0]!.isAlt).toBe(false)
  })

  it('places primary items before alt items within a group', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 50,
            altSourceWorld: 'Carbuncle', altBuyPrice: 1100,
            altSourceConfidence: 0.9, altSourceDataAgeHours: 1 }),
      opp({ itemID: 2, sourceWorld: 'Carbuncle', score: 40 }),
    ]
    const route = buildRoute(selected)
    const carbuncle = route.find(g => g.world === 'Carbuncle')!
    // Primary (item 2) first, then alt (item 1)
    expect(carbuncle.items[0]!.isAlt).toBe(false)
    expect(carbuncle.items[1]!.isAlt).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(buildRoute([])).toEqual([])
  })

  it('skips alt entry when altSourceWorld is undefined', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90 }),
    ]
    const route = buildRoute(selected)

    expect(route).toHaveLength(1)
    expect(route[0]!.items).toHaveLength(1)
  })

  it('sorts alt-only groups by item count descending', () => {
    const selected = [
      opp({ itemID: 1, sourceWorld: 'Ixion', score: 90,
            altSourceWorld: 'Unicorn', altBuyPrice: 1200,
            altSourceConfidence: 0.85, altSourceDataAgeHours: 2 }),
      opp({ itemID: 2, sourceWorld: 'Ixion', score: 80,
            altSourceWorld: 'Carbuncle', altBuyPrice: 1100,
            altSourceConfidence: 0.9, altSourceDataAgeHours: 1 }),
      opp({ itemID: 3, sourceWorld: 'Ixion', score: 70,
            altSourceWorld: 'Carbuncle', altBuyPrice: 1050,
            altSourceConfidence: 0.88, altSourceDataAgeHours: 1.5 }),
    ]
    const route = buildRoute(selected)

    // Ixion is primary, Carbuncle has 2 alts, Unicorn has 1 alt
    const altGroups = route.filter(g => !g.isPrimaryGroup)
    expect(altGroups).toHaveLength(2)
    expect(altGroups[0]!.world).toBe('Carbuncle')
    expect(altGroups[0]!.items).toHaveLength(2)
    expect(altGroups[1]!.world).toBe('Unicorn')
    expect(altGroups[1]!.items).toHaveLength(1)
  })
})
