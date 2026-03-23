<!-- src/client/components/OpportunityTable.svelte -->
<script lang="ts">
  import StaleBadge from './StaleBadge.svelte'
  import type { Opportunity } from '../lib/api.ts'

  const { opportunities }: { opportunities: Opportunity[] } = $props()

  let expanded = $state(new Set<number>())

  function toggle(id: number) {
    // Reassign to a new Set — Svelte 5 $state tracks object identity, not contents.
    // In-place mutation (expanded.add/delete) won't trigger reactivity.
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded = next
  }

  const fmt = (n: number) => n.toLocaleString()
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
      <th>/day</th>
      <th>Home data</th>
      <th>Source data</th>
    </tr>
  </thead>
  <tbody>
    {#each opportunities as opp (opp.itemID)}
      <tr class="main" onclick={() => toggle(opp.itemID)}>
        <td>
          <a href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener"
            onclick={(e) => e.stopPropagation()}>
            {opp.itemName}
          </a>
        </td>
        <td>{opp.sourceWorld}</td>
        <td>{fmt(opp.buyPrice)}</td>
        <td>{fmt(opp.sellPrice)}</td>
        <td>{fmt(opp.profitPerUnit)}</td>
        <td>{opp.recommendedUnits} / {opp.availableUnits}</td>
        <td>{fmt(opp.expectedDailyProfit)}</td>
        <td><StaleBadge confidence={opp.homeConfidence} ageHours={opp.homeDataAgeHours} /></td>
        <td><StaleBadge confidence={opp.sourceConfidence} ageHours={opp.sourceDataAgeHours} /></td>
      </tr>

      {#if opp.altSourceWorld}
        <tr class="alt">
          <td colspan="9" class="alt-cell">
            Alt: {opp.altSourceWorld} — buy {fmt(opp.altBuyPrice ?? 0)} — {fmt(opp.altExpectedDailyProfit ?? 0)}/day
            {#if opp.altSourceConfidence !== undefined && opp.altSourceDataAgeHours !== undefined}
              <StaleBadge confidence={opp.altSourceConfidence} ageHours={opp.altSourceDataAgeHours} />
            {/if}
          </td>
        </tr>
      {/if}

      {#if expanded.has(opp.itemID)}
        <tr class="detail">
          <td colspan="9">
            <div class="detail-inner">
              <span>Competitors: {opp.activeCompetitorCount}</span>
              <span>Fair share velocity: {opp.fairShareVelocity}/day</span>
              <span>Tax: {fmt(opp.tax)} gil</span>
            </div>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>

<style>
  table  { width: 100%; border-collapse: collapse; font-size: 14px; }
  th     { padding: 8px 12px; background: #1a1a2e; color: #777; text-align: left; font-weight: 500; }
  td     { padding: 8px 12px; border-bottom: 1px solid #1e1e2e; color: #ccc; }
  .main  { cursor: pointer; }
  .main:hover td { background: #1e2240; }
  .alt td   { background: #141428; padding: 3px 12px 3px 28px; font-size: 12px; color: #777; }
  .detail td { background: #12122a; }
  .detail-inner { display: flex; gap: 24px; padding: 6px; color: #666; font-size: 12px; }
  a { color: #7eb8f7; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
