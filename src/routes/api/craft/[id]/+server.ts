import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAllItems, getVendorPrices, getNameMap, isCacheReady, getScanProgress } from '$lib/server/cache'
import { solveCraftingCost } from '$lib/server/crafting'

export const GET: RequestHandler = ({ params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'id must be a positive integer' }, { status: 400 })
  }

  if (!isCacheReady()) {
    return json({ ready: false, progress: getScanProgress() }, { status: 202 })
  }

  const result = solveCraftingCost(id, getAllItems(), getVendorPrices(), { nameMap: getNameMap() })
  if (result === null) {
    return json({ error: 'no recipe found for item' }, { status: 404 })
  }

  const recommendation = result.root.action === 'craft' ? 'craft' : 'buy'

  return json({ ...result, recommendation })
}
