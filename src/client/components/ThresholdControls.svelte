<!-- src/client/components/ThresholdControls.svelte -->
<script lang="ts">
  import type { ThresholdState } from '../lib/api.ts'

  let {
    thresholds,
    onchange,
  }: { thresholds: ThresholdState; onchange: (t: ThresholdState) => void } = $props()

  let open = $state(false)

  function emit(patch: Partial<ThresholdState>) {
    onchange({ ...thresholds, ...patch })
  }
</script>

<div class="panel">
  <button class="toggle" onclick={() => (open = !open)}>
    ⚙ Filters {open ? '▲' : '▼'}
  </button>

  {#if open}
    <div class="controls">
      <label>
        Price threshold: {thresholds.price_threshold}×
        <input type="range" min="1.2" max="5.0" step="0.1"
          value={thresholds.price_threshold}
          oninput={(e) => emit({ price_threshold: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label>
        Listing staleness: {thresholds.listing_staleness_hours}h
        <input type="range" min="1" max="168" step="1"
          value={thresholds.listing_staleness_hours}
          oninput={(e) => emit({ listing_staleness_hours: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label>
        Days of supply: {thresholds.days_of_supply}
        <input type="range" min="1" max="14" step="1"
          value={thresholds.days_of_supply}
          oninput={(e) => emit({ days_of_supply: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label class="inline">
        <input type="checkbox"
          checked={thresholds.hq}
          onchange={(e) => emit({ hq: (e.target as HTMLInputElement).checked })}
        />
        HQ only
      </label>

      <label>
        Results:
        <select
          value={String(thresholds.limit)}
          onchange={(e) => emit({ limit: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .panel   { background: #16213e; border-bottom: 1px solid #333; }
  .toggle  { width: 100%; padding: 10px 16px; background: none; border: none; color: #ccc; cursor: pointer; text-align: left; font-size: 14px; }
  .controls { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 16px 16px; }
  label    { display: flex; flex-direction: column; gap: 4px; color: #aaa; font-size: 13px; min-width: 160px; }
  .inline  { flex-direction: row; align-items: center; gap: 8px; }
</style>
