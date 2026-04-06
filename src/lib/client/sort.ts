import type { Opportunity } from '$lib/shared/types'

export type SortColumn = 'profitPerUnit' | 'activeCompetitorCount' | 'fairShareVelocity' | 'expectedDailyProfit'
export type SortDirection = 'asc' | 'desc'
export type SortState = { column: SortColumn | null; direction: SortDirection }

const defaultDirections: Record<SortColumn, SortDirection> = {
  profitPerUnit: 'desc',
  activeCompetitorCount: 'asc',
  fairShareVelocity: 'desc',
  expectedDailyProfit: 'desc',
}

export function toggleSort(state: SortState, clicked: SortColumn): SortState {
  if (state.column !== clicked) {
    return { column: clicked, direction: defaultDirections[clicked] }
  }
  if (state.direction === defaultDirections[clicked]) {
    const reversed: SortDirection = state.direction === 'desc' ? 'asc' : 'desc'
    return { column: clicked, direction: reversed }
  }
  return { column: null, direction: 'desc' }
}

export function sortOpportunities(items: Opportunity[], state: SortState): Opportunity[] {
  if (state.column === null) return items
  const { column, direction } = state
  const multiplier = direction === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const diff = a[column] - b[column]
    if (diff !== 0) return diff * multiplier
    return b.score - a.score  // tiebreaker: score desc always
  })
}
