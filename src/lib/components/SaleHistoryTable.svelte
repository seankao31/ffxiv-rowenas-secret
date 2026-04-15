<script lang="ts">
  import type { Sale } from '$lib/shared/types'
  import { formatNumber, formatRelativeTime } from '$lib/client/format'
  import { applyMarketFilters } from '$lib/client/market-filters'
  import { createMobilePagination } from '$lib/client/mobile-pagination.svelte'

  let { sales, loading, error, selectedWorld, hqOnly }: {
    sales: Sale[]
    loading: boolean
    error: boolean
    selectedWorld: string
    hqOnly: boolean
  } = $props()

  const filteredSales = $derived(applyMarketFilters(sales, selectedWorld, hqOnly))

  const pagination = createMobilePagination()

  // Reset pagination when data or filters change
  $effect(() => {
    void sales
    void selectedWorld
    void hqOnly
    pagination.reset()
  })

  const displayedSales = $derived(pagination.slice(filteredSales))
</script>

{#if loading}
  <div class="flex flex-col gap-2">
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-3/4"></div>
  </div>
{:else if error}
  <p class="text-sm text-error">Unable to load sale history</p>
{:else if filteredSales.length === 0}
  <p class="text-sm text-base-content/50">
    {sales.length === 0 ? 'No sale history found' : 'No sales match the current filters'}
  </p>
{:else}
  <div data-testid="history-scroll-container" class="flex-1 overflow-auto min-h-0">
    <table class="table table-sm">
      <thead>
        <tr>
          <th>World</th>
          <th class="text-right">Price</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Total</th>
          <th>HQ</th>
          <th>Buyer</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {#each displayedSales as sale, i (i)}
          <tr>
            <td>{sale.worldName}</td>
            <td class="text-right">{formatNumber(sale.pricePerUnit)}</td>
            <td class="text-right">{sale.quantity}</td>
            <td class="text-right">{formatNumber(sale.pricePerUnit * sale.quantity)}</td>
            <td>{sale.hq ? '★' : ''}</td>
            <td>{sale.buyerName ?? '—'}</td>
            <td>{formatRelativeTime(sale.timestamp)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if pagination.hasMore(filteredSales.length)}
    <button class="btn btn-ghost btn-sm w-full mt-2" onclick={pagination.showMore}>
      Show more ({pagination.remaining(filteredSales.length)} remaining)
    </button>
  {/if}
{/if}
