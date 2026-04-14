type Filterable = { worldName: string; hq: boolean }

export function applyMarketFilters<T extends Filterable>(
  items: T[],
  selectedWorld: string,
  hqOnly: boolean,
): T[] {
  let result = items
  if (selectedWorld !== 'all') {
    result = result.filter(item => item.worldName === selectedWorld)
  }
  if (hqOnly) {
    result = result.filter(item => item.hq)
  }
  return result
}
