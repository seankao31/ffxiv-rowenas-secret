<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { fetchItemMetadata, getIconUrl, getEnglishName, resolveDisplayName, subscribe } from '$lib/client/xivapi.ts'
  import { fetchItemSaleHistory } from '$lib/client/universalis'
  import { DC_WORLDS } from '$lib/shared/universalis'
  import { applyMarketFilters } from '$lib/client/market-filters'
  import type { Sale } from '$lib/shared/types'
  import ListingsTable from '$lib/components/ListingsTable.svelte'
  import SaleHistoryTable from '$lib/components/SaleHistoryTable.svelte'
  import PriceStats from '$lib/components/PriceStats.svelte'
  import CraftingBreakdown from '$lib/components/CraftingBreakdown.svelte'

  let { data } = $props()

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  $effect(() => {
    fetchItemMetadata([data.itemID])
  })

  const iconUrl = $derived.by(() => { void nameGeneration; return getIconUrl(data.itemID) })
  const primaryName = $derived.by(() => { void nameGeneration; return resolveDisplayName(data.itemID, data.twName) })
  // getEnglishName is intentional here: enName is the English subtitle shown below
  // the TW primary name, not a fallback. Don't replace with resolveDisplayName.
  const enName = $derived.by(() => { void nameGeneration; return getEnglishName(data.itemID) ?? null })
  const secondaryName = $derived(data.twName ? enName : null)

  let sales = $state<Sale[]>([])
  let salesLoading = $state(true)
  let salesError = $state(false)

  let selectedWorld = $state('all')
  let hqOnly = $state(false)

  const filteredSales = $derived(applyMarketFilters(sales, selectedWorld, hqOnly))

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

  const activeTab = $derived($page.url.searchParams.get('tab') ?? 'market')

  function selectTab(tab: string) {
    const url = new URL($page.url)
    if (tab === 'market') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    goto(url.toString(), { replaceState: true, noScroll: true })
  }
</script>

<svelte:head>
  <title>{primaryName} — 羅薇娜的商業機密</title>
</svelte:head>

<!-- Item Header -->
<div class="flex items-center gap-3 py-4 shrink-0 flex-wrap">
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

  <div class="ml-auto flex items-center gap-1 text-xs text-base-content/40" data-testid="external-links">
    <a href="https://universalis.app/market/{data.itemID}" target="_blank" rel="noopener" class="hover:text-base-content/70 transition-colors">Universalis</a>
    <span>·</span>
    <a href="https://www.garlandtools.org/db/#item/{data.itemID}" target="_blank" rel="noopener" class="hover:text-base-content/70 transition-colors">Garland Tools</a>
    <span>·</span>
    <a href="https://ffxivteamcraft.com/db/en/item/{data.itemID}/" target="_blank" rel="noopener" class="hover:text-base-content/70 transition-colors">Teamcraft</a>
  </div>
</div>

<!-- Tab Bar -->
<div class="flex gap-1 border-b border-base-300 mb-4 shrink-0" role="tablist">
  <button
    role="tab"
    aria-selected={activeTab === 'market'}
    class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer
      {activeTab === 'market'
        ? 'border-accent text-accent'
        : 'border-transparent text-base-content/50 hover:text-base-content/80'}"
    onclick={() => selectTab('market')}
  >
    Market
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'crafting'}
    disabled={!data.hasRecipe}
    class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
      {activeTab === 'crafting'
        ? 'border-accent text-accent cursor-pointer'
        : data.hasRecipe
          ? 'border-transparent text-base-content/50 hover:text-base-content/80 cursor-pointer'
          : 'border-transparent text-base-content/20 cursor-not-allowed'}"
    onclick={() => selectTab('crafting')}
  >
    Crafting
  </button>
</div>

<!-- Tab Content -->
{#if activeTab === 'market'}
  <div class="flex items-center gap-2 mb-4 shrink-0">
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

  <!-- Listings | History -->
  <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
    <div class="card bg-base-200 min-h-0 flex flex-col">
      <div class="card-body flex flex-col min-h-0">
        <h2 class="card-title shrink-0">Cross-World Listings</h2>
        <ListingsTable itemId={data.itemID} {selectedWorld} {hqOnly} />
      </div>
    </div>

    <div class="card bg-base-200 min-h-0 flex flex-col">
      <div class="card-body flex flex-col min-h-0">
        <h2 class="card-title shrink-0">Sale History</h2>
        <SaleHistoryTable {sales} loading={salesLoading} error={salesError} {selectedWorld} {hqOnly} />
      </div>
    </div>
  </div>

  <!-- Price Statistics -->
  <div class="card bg-base-200 mt-4 shrink-0">
    <div class="card-body">
      <h2 class="card-title">Price Statistics</h2>
      <PriceStats sales={filteredSales} loading={salesLoading} error={salesError} />
    </div>
  </div>
{:else if activeTab === 'crafting'}
  <div class="flex-1 min-h-0 overflow-auto">
    <CraftingBreakdown itemId={data.itemID} />
  </div>
{/if}
