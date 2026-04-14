<script lang="ts">
  import type { Listing } from '$lib/shared/types'
  import { fetchItemListings } from '$lib/client/universalis'
  import { applyMarketFilters } from '$lib/client/market-filters'
  import { formatNumber, formatRelativeTime } from '$lib/client/format'

  let { itemId, selectedWorld, hqOnly }: {
    itemId: number
    selectedWorld: string
    hqOnly: boolean
  } = $props()

  let listings = $state<Listing[]>([])
  let loading = $state(true)
  let error = $state(false)

  const filteredListings = $derived(applyMarketFilters(listings, selectedWorld, hqOnly))

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

</script>

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
