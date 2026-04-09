import { error } from '@sveltejs/kit'
import { getNameMap, waitForNameCache } from '$lib/server/cache'

export async function load({ params }: { params: { id: string } }) {
  const parsed = Number(params.id)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    error(400, 'Invalid item ID')
  }

  await waitForNameCache()
  const twName = getNameMap().get(parsed) ?? null
  return { itemID: parsed, twName }
}
