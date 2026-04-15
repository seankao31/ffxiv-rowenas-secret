<script lang="ts">
  import type { Opportunity } from '$lib/client/api.ts'
  import { confidenceColor } from '$lib/shared/format'
  import CopyButton from '$lib/components/CopyButton.svelte'
  import { Info, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-svelte'
  import { toggleSort, sortOpportunities, type SortState, type SortColumn } from '$lib/client/sort.ts'
  import { resolveDisplayName, isFallbackName, subscribe, getIconUrl, fetchItemMetadata } from '$lib/client/xivapi.ts'
  import { tooltip } from '$lib/client/tooltip.ts'
  import { fetchVendorInfo, getVendorInfo, setOnChange as setVendorOnChange } from '$lib/client/vendors.ts'

  const {
    opportunities,
    selectedIds,
    ontoggle,
  }: {
    opportunities: Opportunity[]
    selectedIds: Set<number>
    ontoggle: (itemID: number) => void
  } = $props()

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  let vendorGeneration = $state(0)
  setVendorOnChange(() => vendorGeneration++)

  $effect(() => {
    if (opportunities.length > 0) {
      fetchItemMetadata(opportunities.map(o => o.itemID))
    }
  })

  // Fetch vendor metadata for NPC-sourced opportunities
  $effect(() => {
    const npcItems = opportunities.filter(o => o.sourceWorld === 'NPC' || o.altSourceWorld === 'NPC')
    for (const opp of npcItems) {
      fetchVendorInfo(opp.itemID)
    }
  })

  const fmt = (n: number) => n.toLocaleString()
  const name = (opp: Opportunity) => { void nameGeneration; return resolveDisplayName(opp.itemID, opp.itemName) }
  const iconUrl = (opp: Opportunity) => { void nameGeneration; return getIconUrl(opp.itemID) }

  function ageLabel(ageHours: number): string {
    return ageHours < 1
      ? `${Math.round(ageHours * 60)}min ago`
      : `${ageHours.toFixed(1)}h ago`
  }

  const isNPC = (world: string) => world === 'NPC'

  const ageColor = confidenceColor

  const totalVelocity = (opp: Opportunity) =>
    Math.round(opp.fairShareVelocity * (opp.activeCompetitorCount + 1) * 100) / 100

  let sort = $state<SortState>({ column: null, direction: 'desc' })

  const sorted = $derived(sortOpportunities(opportunities, sort))

  function onSort(column: SortColumn) {
    sort = toggleSort(sort, column)
  }
</script>

{#snippet infoIcon()}
  <Info class="inline w-3.5 h-3.5 opacity-40 align-middle ml-1" strokeWidth={3.5} />
{/snippet}

{#snippet npcBadge(itemID: number, size: 'sm' | 'xs')}
  {@const _ = vendorGeneration}
  {@const vendors = getVendorInfo(itemID)}
  {#if vendors && vendors.length > 0}
    <!-- Stop propagation so clicking the NPC badge doesn't toggle row selection. -->
    <div class="dropdown dropdown-hover dropdown-end" onclick={(e: MouseEvent) => e.stopPropagation()} role="presentation">
      <div tabindex="0" role="button" class="badge badge-{size} badge-soft badge-info cursor-help">NPC</div>
      <div tabindex="0" class="dropdown-content z-10 shadow-md bg-base-200 rounded-box p-2 w-56">
        {#each vendors as v}
          <div class="text-xs py-0.5">{v.npcName} — {v.zone}</div>
        {/each}
      </div>
    </div>
  {:else}
    <span class="badge badge-{size} badge-soft badge-info" onclick={(e: MouseEvent) => e.stopPropagation()} role="presentation">NPC</span>
  {/if}
{/snippet}

{#snippet sortIcon(column: SortColumn)}
  <span class="inline-flex items-center">
    {#if sort.column === column}
      {#if sort.direction === 'asc'}
        <ArrowUp class="inline w-3.5 h-3.5 opacity-90" strokeWidth={3.5} />
      {:else}
        <ArrowDown class="inline w-3.5 h-3.5 opacity-90" strokeWidth={3.5} />
      {/if}
    {:else}
      <ArrowUpDown class="inline w-3.5 h-3.5 opacity-50" strokeWidth={3.5} />
    {/if}
  </span>
{/snippet}

<div data-testid="table-container" class="flex-1 overflow-auto min-h-0">
  <table class="table table-pin-rows w-max lg:w-full">
    <thead>
      <tr>
        <th class="sticky left-0 z-20 bg-base-200">Item</th>
        <th>Buy from</th>
        <th>Buy</th>
        <th>Sell <span {@attach tooltip("Estimated sell price: the lower of the cheapest listing and the median recent sale. Second line (if shown) is the current cheapest listing on the market board.")}>{@render infoIcon()}</span></th>
        <th class="cursor-pointer" aria-label="Sort by profitPerUnit" onclick={() => onSort('profitPerUnit')}>Profit/unit {@render sortIcon('profitPerUnit')} <span {@attach tooltip("Sell price after 5% tax, minus buy price. Second line (if shown) uses the market board listing instead.")}>{@render infoIcon()}</span></th>
        <th>Units <span {@attach tooltip("Recommended / available at source. Recommended is capped by fair-share velocity × days of supply.")}>{@render infoIcon()}</span></th>
        <th class="cursor-pointer" aria-label="Sort by activeCompetitorCount" onclick={() => onSort('activeCompetitorCount')}>Comp {@render sortIcon('activeCompetitorCount')} <span {@attach tooltip("Active competing listings on the home world near the expected sell price.")}>{@render infoIcon()}</span></th>
        <th class="cursor-pointer" aria-label="Sort by fairShareVelocity" onclick={() => onSort('fairShareVelocity')}>Vel {@render sortIcon('fairShareVelocity')} <span {@attach tooltip("Your fair share of daily sales: total velocity ÷ (competitors + 1). Second line shows total market velocity.")}>{@render infoIcon()}</span></th>
        <th class="cursor-pointer" aria-label="Sort by expectedDailyProfit" onclick={() => onSort('expectedDailyProfit')}>Gil/day {@render sortIcon('expectedDailyProfit')} <span {@attach tooltip("Expected daily profit: profit per unit × fair-share velocity. Second line (if shown) is an alternative source world, for comparison only — all other columns use the primary source.")}>{@render infoIcon()}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as opp (opp.itemID)}
        {@const icon = iconUrl(opp)}
        <tr
          class="group/row cursor-pointer border-l-3 {selectedIds.has(opp.itemID) ? 'border-primary bg-primary/10 hover:bg-primary/20' : 'border-transparent hover:bg-base-300'}"
          onclick={() => ontoggle(opp.itemID)}
        >
          <!-- Item -->
          <td class="sticky left-0 z-10 border-r border-base-300 {selectedIds.has(opp.itemID) ? 'bg-primary/10 group-hover/row:bg-primary/20' : 'bg-base-100 group-hover/row:bg-base-300'}">
            <div class="flex items-center gap-1.5">
              {#if icon}
                <img src={icon} alt="" width="32" height="32" class="flex-shrink-0 hidden lg:inline-block"
                  onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              {/if}
              <a class="link link-info no-underline hover:underline max-w-[150px] truncate lg:max-w-none" href="/item/{opp.itemID}" onclick={(e: MouseEvent) => e.stopPropagation()}>
                {name(opp)}
              </a>
              <span class="hidden lg:inline-flex">
                {#if !isFallbackName(name(opp))}
                  <CopyButton text={name(opp)} />
                {/if}
              </span>
            </div>
          </td>

          <!-- Buy from -->
          <td>
            <div>
              {#if isNPC(opp.sourceWorld)}
                {@render npcBadge(opp.itemID, 'sm')}
              {:else}
                {opp.sourceWorld}
              {/if}
            </div>
            {#if opp.altSourceWorld}
              <div class="text-xs text-base-content/50 mt-1">
                {#if isNPC(opp.altSourceWorld)}
                  {@render npcBadge(opp.itemID, 'xs')}
                {:else}
                  {opp.altSourceWorld}
                {/if}
              </div>
            {/if}
          </td>

          <!-- Buy -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.buyPrice)}</span>
              <span class="text-xs whitespace-nowrap" style="color: {ageColor(opp.sourceConfidence)}">
                {#if isNPC(opp.sourceWorld)}NPC{:else}{ageLabel(opp.sourceDataAgeHours)}{/if}
              </span>
            </div>
            {#if opp.altSourceWorld && opp.altBuyPrice !== undefined}
              <div class="flex items-baseline gap-2.5 mt-1">
                <span class="w-[70px] text-right flex-shrink-0 text-xs text-base-content/50">{fmt(opp.altBuyPrice)}</span>
                {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
                  <span class="text-xs whitespace-nowrap" style="color: {ageColor(opp.altSourceConfidence)}">
                    {#if isNPC(opp.altSourceWorld ?? '')}NPC{:else}{ageLabel(opp.altSourceDataAgeHours)}{/if}
                  </span>
                {/if}
              </div>
            {/if}
          </td>

          <!-- Sell -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.sellPrice)}</span>
              {#if opp.sellDestination === 'vendor'}
                <span class="badge badge-sm badge-soft badge-info">NPC</span>
              {:else}
                <span class="text-xs whitespace-nowrap" style="color: {ageColor(opp.homeConfidence)}">{ageLabel(opp.homeDataAgeHours)}</span>
              {/if}
            </div>
            {#if opp.sellDestination !== 'vendor' && opp.listingPrice !== opp.sellPrice}
              <div class="flex items-baseline gap-2.5 mt-1">
                <span class="w-[70px] text-right flex-shrink-0 text-xs text-base-content/40">{fmt(opp.listingPrice)}</span>
              </div>
            {/if}
          </td>

          <!-- Profit/unit -->
          <td class="tabular-nums">
            <div>{fmt(opp.profitPerUnit)}</div>
            {#if opp.listingProfitPerUnit !== opp.profitPerUnit}
              <div class="text-xs text-base-content/40 mt-1">{fmt(opp.listingProfitPerUnit)}</div>
            {/if}
          </td>

          <!-- Units -->
          <td>
            {#if opp.availableUnits < 0}
              <div>{opp.recommendedUnits} / ∞</div>
            {:else}
              <div>{opp.recommendedUnits} / {opp.availableUnits}</div>
            {/if}
          </td>

          <!-- Comp -->
          <td>
            <div>{opp.activeCompetitorCount}</div>
          </td>

          <!-- Vel -->
          <td class="tabular-nums">
            <div>{opp.fairShareVelocity}</div>
            <div class="text-xs text-base-content/40 mt-1">{totalVelocity(opp)} total</div>
          </td>

          <!-- Gil/day -->
          <td class="tabular-nums">
            <div>{fmt(opp.expectedDailyProfit)}</div>
            {#if opp.altSourceWorld && opp.altExpectedDailyProfit !== undefined}
              <div class="text-xs text-base-content/50 mt-1">{fmt(opp.altExpectedDailyProfit)}</div>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
