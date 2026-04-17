import { error } from '@sveltejs/kit'
import { getAllItems, getNameMap, waitForNameCache } from '$lib/server/cache'
import { getRecipesByResult } from '$lib/server/recipes'

export async function load({ params }: { params: { id: string } }) {
  const parsed = Number(params.id)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    error(400, 'Invalid item ID')
  }

  await waitForNameCache()
  const nameMap = getNameMap()
  const itemCache = getAllItems()

  // Narrow fail-fast: both caches settled empty. Intent-documenting guard —
  // does not fix the pre-existing startup-hang path (waitForNameCache can
  // block forever if setNameMap is never called). Tracked separately.
  if (nameMap.size === 0 && itemCache.size === 0) {
    error(503, 'Item data temporarily unavailable')
  }

  // Union validity oracle: an item "exists" if either cache knows about it.
  // Covers the patch-lag window where the scanner sees an item before the
  // TW name map is updated — the dashboard can still link to those rows.
  if (!nameMap.has(parsed) && !itemCache.has(parsed)) {
    error(404, 'Item not found')
  }

  const twName = nameMap.get(parsed) ?? null
  const hasRecipe = getRecipesByResult(parsed).length > 0
  return { itemID: parsed, twName, hasRecipe }
}
