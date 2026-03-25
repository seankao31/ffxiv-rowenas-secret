<!-- src/client/components/OpportunityTable.svelte -->
<script lang="ts">
  import type { Opportunity } from '../lib/api.ts'
  import { resolveItemName, setOnChange } from '../lib/item-names.ts'

  const { opportunities }: { opportunities: Opportunity[] } = $props()

  let nameGeneration = $state(0)
  setOnChange(() => nameGeneration++)

  const fmt = (n: number) => n.toLocaleString()
  const name = (opp: Opportunity) => { void nameGeneration; return resolveItemName(opp.itemID, opp.itemName) }

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

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th>Buy from</th>
      <th>Buy</th>
      <th>Sell</th>
      <th>Profit/unit</th>
      <th>Units</th>
      <th>Comp</th>
      <th>Vel</th>
      <th>Gil/day</th>
    </tr>
  </thead>
  <tbody>
    {#each opportunities as opp (opp.itemID)}
      <tr>
        <!-- Item -->
        <td>
          <a href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener">
            {name(opp)}
          </a>
        </td>

        <!-- Buy from -->
        <td>
          <div class="primary">{opp.sourceWorld}</div>
          {#if opp.altSourceWorld}
            <div class="secondary">{opp.altSourceWorld}</div>
          {/if}
        </td>

        <!-- Buy -->
        <td>
          <div class="price-line">
            <span class="val">{fmt(opp.buyPrice)}</span>
            <span class="age" style="color: {ageColor(opp.sourceConfidence)}">{ageLabel(opp.sourceDataAgeHours)}</span>
          </div>
          {#if opp.altSourceWorld && opp.altBuyPrice !== undefined}
            <div class="alt-line">
              <span class="val">{fmt(opp.altBuyPrice)}</span>
              {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
                <span class="age" style="color: {ageColor(opp.altSourceConfidence)}">{ageLabel(opp.altSourceDataAgeHours)}</span>
              {/if}
            </div>
          {/if}
        </td>

        <!-- Sell -->
        <td>
          <div class="price-line">
            <span class="val">{fmt(opp.sellPrice)}</span>
            <span class="age" style="color: {ageColor(opp.homeConfidence)}">{ageLabel(opp.homeDataAgeHours)}</span>
          </div>
          {#if opp.listingPrice !== opp.sellPrice}
            <div class="alt-line">
              <span class="val listing">{fmt(opp.listingPrice)}</span>
            </div>
          {/if}
        </td>

        <!-- Profit/unit -->
        <td>
          <div class="primary">{fmt(opp.profitPerUnit)}</div>
          <div class="meta">{fmt(opp.tax)} tax</div>
        </td>

        <!-- Units -->
        <td>
          <div class="primary">{opp.recommendedUnits} / {opp.availableUnits}</div>
        </td>

        <!-- Comp -->
        <td>
          <div class="primary">{opp.activeCompetitorCount}</div>
        </td>

        <!-- Vel -->
        <td>
          <div class="primary">{opp.fairShareVelocity}</div>
          <div class="meta">{totalVelocity(opp)} total</div>
        </td>

        <!-- Gil/day -->
        <td>
          <div class="primary">{fmt(opp.expectedDailyProfit)}</div>
          {#if opp.altSourceWorld && opp.altExpectedDailyProfit !== undefined}
            <div class="secondary">{fmt(opp.altExpectedDailyProfit)}</div>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table  { width: 100%; border-collapse: collapse; font-size: 15px; }
  th     { padding: 10px 14px; background: #1a1a2e; color: #777; text-align: left; font-weight: 500; font-size: 12px; }
  td     { padding: 12px 14px; border-bottom: 1px solid #1e1e2e; color: #ccc; font-variant-numeric: tabular-nums; vertical-align: top; }
  tr:hover td { background: #1e2240; }

  /* Primary / secondary text lines */
  .primary   { font-size: 15px; color: #ccc; }
  .secondary { font-size: 11px; color: #888; margin-top: 5px; }
  .meta      { font-size: 11px; color: #666; margin-top: 5px; }

  /* Price + age flex lines */
  .price-line {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .price-line .val {
    width: 70px;
    text-align: right;
    flex-shrink: 0;
    font-size: 15px;
    color: #ccc;
  }
  .price-line .age {
    font-size: 11px;
  }

  .alt-line {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-top: 5px;
  }
  .alt-line .val {
    width: 70px;
    text-align: right;
    flex-shrink: 0;
    font-size: 11px;
    color: #888;
  }
  .alt-line .val.listing {
    color: #666;
  }
  .alt-line .age {
    font-size: 11px;
  }

  /* Links */
  a { color: #7eb8f7; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
