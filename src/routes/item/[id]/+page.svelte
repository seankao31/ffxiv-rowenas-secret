<script lang="ts">
  import { fetchItemMetadata, getIconUrl, getEnglishName, subscribe } from '$lib/client/xivapi.ts'
  import { fetchItemSaleHistory } from '$lib/client/universalis'
  import type { Sale } from '$lib/shared/types'
  import ListingsTable from '$lib/components/ListingsTable.svelte'
  import SaleHistoryTable from '$lib/components/SaleHistoryTable.svelte'
  import PriceStats from '$lib/components/PriceStats.svelte'

  let { data } = $props()

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  $effect(() => {
    fetchItemMetadata([data.itemID])
  })

  const iconUrl = $derived.by(() => { void nameGeneration; return getIconUrl(data.itemID) })
  const enName = $derived.by(() => { void nameGeneration; return getEnglishName(data.itemID) ?? null })
  const primaryName = $derived(data.twName ?? enName ?? `Item #${data.itemID}`)
  const secondaryName = $derived(data.twName ? enName : null)

  let sales = $state<Sale[]>([])
  let salesLoading = $state(true)
  let salesError = $state(false)

  // No cancellation guard needed: SvelteKit destroys the component on route navigation,
  // so a stale response from a previous itemID cannot overwrite a newer one.
  $effect(() => {
    salesLoading = true
    salesError = false
    fetchItemSaleHistory(data.itemID).then(result => {
      sales = result
      salesLoading = false
    }).catch(err => {
      console.warn('[universalis] Failed to fetch sale history:', err)
      salesError = true
      salesLoading = false
    })
  })
</script>

<svelte:head>
  <title>{primaryName} — 羅薇娜的商業機密</title>
</svelte:head>

<!-- Item Header -->
<div class="flex items-center gap-3 py-4 shrink-0">
  {#if iconUrl}
    <img src={iconUrl} alt="" width="40" height="40" class="flex-shrink-0"
      onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
  {:else}
    <div class="skeleton h-10 w-10 flex-shrink-0"></div>
  {/if}

  <div class="flex items-baseline gap-2">
    <h1 class="text-lg font-bold">{primaryName}</h1>
    {#if secondaryName}
      <span class="text-sm text-base-content/50">{secondaryName}</span>
    {/if}
    <span class="badge badge-soft">{data.itemID}</span>
  </div>
</div>

<!-- Listings | History -->
<div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
  <div class="card bg-base-200 min-h-0 flex flex-col">
    <div class="card-body flex flex-col min-h-0">
      <h2 class="card-title shrink-0">Cross-World Listings</h2>
      <ListingsTable itemId={data.itemID} />
    </div>
  </div>

  <div class="card bg-base-200 min-h-0 flex flex-col">
    <div class="card-body flex flex-col min-h-0">
      <h2 class="card-title shrink-0">Sale History</h2>
      <SaleHistoryTable {sales} loading={salesLoading} error={salesError} />
    </div>
  </div>
</div>

<!-- Price Statistics -->
<div class="card bg-base-200 mt-4 shrink-0">
  <div class="card-body">
    <h2 class="card-title">Price Statistics</h2>
    <PriceStats {sales} loading={salesLoading} error={salesError} />
  </div>
</div>
