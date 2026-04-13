<script lang="ts">
  import type { Sale } from '$lib/shared/types'
  import { formatNumber, formatRelativeTime } from '$lib/client/format'

  let { sales, loading, error }: { sales: Sale[]; loading: boolean; error: boolean } = $props()
</script>

{#if loading}
  <div class="flex flex-col gap-2">
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-3/4"></div>
  </div>
{:else if error}
  <p class="text-sm text-error">Unable to load sale history</p>
{:else if sales.length === 0}
  <p class="text-sm text-base-content/50">No sale history found</p>
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
        {#each sales as sale, i (i)}
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
{/if}
