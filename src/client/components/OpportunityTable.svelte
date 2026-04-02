<!-- src/client/components/OpportunityTable.svelte -->
<script lang="ts">
  import type { Opportunity } from '../lib/api.ts'
  import { Info } from 'lucide-svelte'
  import { resolveItemName, setOnChange, getIconUrl, fetchItemMetadata } from '../lib/xivapi.ts'
  import { tooltip } from '../lib/tooltip.ts'

  const { opportunities }: { opportunities: Opportunity[] } = $props()

  let nameGeneration = $state(0)
  setOnChange(() => nameGeneration++)

  $effect(() => {
    if (opportunities.length > 0) {
      fetchItemMetadata(opportunities.map(o => o.itemID))
    }
  })

  const fmt = (n: number) => n.toLocaleString()
  const name = (opp: Opportunity) => { void nameGeneration; return resolveItemName(opp.itemID, opp.itemName) }
  const iconUrl = (opp: Opportunity) => { void nameGeneration; return getIconUrl(opp.itemID) }

  function ageLabel(ageHours: number): string {
    return ageHours < 1
      ? `${Math.round(ageHours * 60)}min ago`
      : `${ageHours.toFixed(1)}h ago`
  }

  function ageColor(confidence: number): string {
    if (confidence >= 0.85) return '#5b5'
    if (confidence >= 0.60) return '#cb3'
    if (confidence >= 0.25) return '#e83'
    return '#d44'
  }

  const totalVelocity = (opp: Opportunity) =>
    Math.round(opp.fairShareVelocity * (opp.activeCompetitorCount + 1) * 100) / 100
</script>

{#snippet infoIcon()}
  <Info class="inline w-3.5 h-3.5 opacity-40 align-middle ml-1" />
{/snippet}

<div class="flex-1 overflow-y-auto min-h-0">
  <table class="table table-pin-rows">
    <thead>
      <tr>
        <th>Item</th>
        <th>Buy from</th>
        <th>Buy</th>
        <th>Sell <span use:tooltip={"Estimated sell price: the lower of the cheapest listing and the median recent sale. Second line (if shown) is the current cheapest listing on the market board."}>{@render infoIcon()}</span></th>
        <th>Profit/unit <span use:tooltip={"Sell price after 5% tax, minus buy price. Second line (if shown) uses the market board listing instead."}>{@render infoIcon()}</span></th>
        <th>Units <span use:tooltip={"Recommended / available at source. Recommended is capped by fair-share velocity × days of supply."}>{@render infoIcon()}</span></th>
        <th>Comp <span use:tooltip={"Active competing listings on the home world near the expected sell price."}>{@render infoIcon()}</span></th>
        <th>Vel <span use:tooltip={"Your fair share of daily sales: total velocity ÷ (competitors + 1). Second line shows total market velocity."}>{@render infoIcon()}</span></th>
        <th>Gil/day <span use:tooltip={"Expected daily profit: profit per unit × fair-share velocity. Second line (if shown) is an alternative source world, for comparison only — all other columns use the primary source."}>{@render infoIcon()}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each opportunities as opp (opp.itemID)}
        {@const icon = iconUrl(opp)}
        <tr class="hover">
          <!-- Item -->
          <td>
            <div class="flex items-center gap-1.5">
              {#if icon}
                <img src={icon} alt="" width="32" height="32" class="flex-shrink-0"
                  onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              {/if}
              <a class="link link-info no-underline hover:underline" href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener">
                {name(opp)}
              </a>
            </div>
          </td>

          <!-- Buy from -->
          <td>
            <div>{opp.sourceWorld}</div>
            {#if opp.altSourceWorld}
              <div class="text-xs text-base-content/50 mt-1">{opp.altSourceWorld}</div>
            {/if}
          </td>

          <!-- Buy -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.buyPrice)}</span>
              <span class="text-xs" style="color: {ageColor(opp.sourceConfidence)}">{ageLabel(opp.sourceDataAgeHours)}</span>
            </div>
            {#if opp.altSourceWorld && opp.altBuyPrice !== undefined}
              <div class="flex items-baseline gap-2.5 mt-1">
                <span class="w-[70px] text-right flex-shrink-0 text-xs text-base-content/50">{fmt(opp.altBuyPrice)}</span>
                {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
                  <span class="text-xs" style="color: {ageColor(opp.altSourceConfidence)}">{ageLabel(opp.altSourceDataAgeHours)}</span>
                {/if}
              </div>
            {/if}
          </td>

          <!-- Sell -->
          <td class="tabular-nums">
            <div class="flex items-baseline gap-2.5">
              <span class="w-[70px] text-right flex-shrink-0">{fmt(opp.sellPrice)}</span>
              <span class="text-xs" style="color: {ageColor(opp.homeConfidence)}">{ageLabel(opp.homeDataAgeHours)}</span>
            </div>
            {#if opp.listingPrice !== opp.sellPrice}
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
            <div>{opp.recommendedUnits} / {opp.availableUnits}</div>
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
