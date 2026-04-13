<script lang="ts">
  import type { Sale } from '$lib/shared/types'
  import { computePriceStats } from '$lib/client/price-stats'
  import { formatNumber } from '$lib/client/format'

  const { sales, loading, error }: { sales: Sale[]; loading: boolean; error: boolean } = $props()

  const stats = $derived(computePriceStats(sales))
</script>

{#if loading}
  <div class="flex flex-col gap-2">
    <div class="skeleton h-4 w-1/3"></div>
    <div class="skeleton h-4 w-1/3"></div>
    <div class="skeleton h-4 w-1/3"></div>
  </div>
{:else if error}
  <p class="text-sm text-error">Unable to load price statistics</p>
{:else if stats === null}
  <p class="text-sm text-base-content/50">No data available</p>
{:else}
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
    <div>
      <div class="text-xs text-base-content/50">Min Price</div>
      <div class="text-sm font-semibold">{formatNumber(stats.minPrice)}</div>
    </div>
    <div>
      <div class="text-xs text-base-content/50">Median Price</div>
      <div class="text-sm font-semibold">{formatNumber(stats.medianPrice)}</div>
    </div>
    <div>
      <div class="text-xs text-base-content/50">Avg Price</div>
      <div class="text-sm font-semibold">{formatNumber(Math.round(stats.avgPrice))}</div>
    </div>
    <div>
      <div class="text-xs text-base-content/50">Volume (24h)</div>
      <div class="text-sm font-semibold">{formatNumber(stats.volume24h)}</div>
      <div class="text-xs text-base-content/50">{stats.hqVolume24h} HQ / {stats.nqVolume24h} NQ</div>
    </div>
    <div>
      <div class="text-xs text-base-content/50">Volume (7d)</div>
      <div class="text-sm font-semibold">{formatNumber(stats.volume7d)}</div>
      <div class="text-xs text-base-content/50">{stats.hqVolume7d} HQ / {stats.nqVolume7d} NQ</div>
    </div>
  </div>
{/if}
