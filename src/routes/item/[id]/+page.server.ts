import { error } from '@sveltejs/kit'
import { getNameMap } from '$lib/server/cache'

export function load({ params }: { params: { id: string } }) {
  const parsed = Number(params.id)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    error(400, 'Invalid item ID')
  }

  const twName = getNameMap().get(parsed) ?? null
  return { itemID: parsed, twName }
}
