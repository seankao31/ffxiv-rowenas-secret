<script lang="ts">
  import type { Listing } from '$lib/shared/types'
  import { DC_WORLDS } from '$lib/shared/universalis'
  import { fetchItemListings } from '$lib/client/universalis'

  let { itemId }: { itemId: number } = $props()

  let listings = $state<Listing[]>([])
  let loading = $state(true)
  let error = $state(false)
  let selectedWorld = $state('all')
  let hqOnly = $state(false)

  const filteredListings = $derived.by(() => {
    let result = listings
    if (selectedWorld !== 'all') {
      result = result.filter(l => l.worldName === selectedWorld)
    }
    if (hqOnly) {
      result = result.filter(l => l.hq)
    }
    return result
  })

  // Note: this $effect has no cancellation guard for rapid itemId changes.
  // Currently safe because SvelteKit destroys the component on route navigation.
  // If reused in a context with dynamic itemId, add an AbortController or
  // staleness flag to prevent a slower response from overwriting a newer one.
  $effect(() => {
    loading = true
    error = false
    fetchItemListings(itemId).then(result => {
      listings = result
      loading = false
    }).catch(err => {
      console.warn('[universalis] Failed to fetch listings:', err)
      error = true
      loading = false
    })
  })

  function formatNumber(n: number): string {
    return n.toLocaleString()
  }

  function formatRelativeTime(unixMs: number): string {
    const seconds = Math.floor((Date.now() - unixMs) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }
</script>

<div class="flex items-center gap-2 mb-3 shrink-0">
  <select class="select select-sm" bind:value={selectedWorld}>
    <option value="all">All Worlds</option>
    {#each DC_WORLDS as world (world.id)}
      <option value={world.name}>{world.name}</option>
    {/each}
  </select>

  <label class="label cursor-pointer gap-1">
    <input type="checkbox" class="toggle toggle-sm" bind:checked={hqOnly} />
    <span class="text-sm">HQ only</span>
  </label>
</div>

{#if loading}
  <div class="flex flex-col gap-2">
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-3/4"></div>
  </div>
{:else if error}
  <p class="text-sm text-error">Unable to load listings</p>
{:else if filteredListings.length === 0}
  <p class="text-sm text-base-content/50">
    {listings.length === 0 ? 'No listings found' : 'No listings match the current filters'}
  </p>
{:else}
  <div data-testid="listings-scroll-container" class="flex-1 overflow-auto min-h-0">
    <table class="table table-sm">
      <thead>
        <tr>
          <th>World</th>
          <th class="text-right">Price</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Total</th>
          <th>HQ</th>
          <th>Last Review</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredListings as listing}
          <tr>
            <td>{listing.worldName}</td>
            <td class="text-right">{formatNumber(listing.pricePerUnit)}</td>
            <td class="text-right">{listing.quantity}</td>
            <td class="text-right">{formatNumber(listing.pricePerUnit * listing.quantity)}</td>
            <td>{listing.hq ? '★' : ''}</td>
            <td>{formatRelativeTime(listing.lastReviewTime)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
