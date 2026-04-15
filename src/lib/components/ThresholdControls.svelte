<script lang="ts">
  import { Settings, ChevronUp, ChevronDown } from 'lucide-svelte'
  import type { ThresholdState } from '$lib/client/api.ts'

  let {
    thresholds,
    onchange,
  }: { thresholds: ThresholdState; onchange: (t: ThresholdState) => void } = $props()

  let open = $state(false)

  function emit(patch: Partial<ThresholdState>) {
    onchange({ ...thresholds, ...patch })
  }

  function clampEmit(key: keyof ThresholdState, value: number, min: number, max: number) {
    emit({ [key]: Math.min(max, Math.max(min, value)) } as Partial<ThresholdState>)
  }
</script>

<div class="bg-base-200 border-b border-base-300">
  <button class="w-full py-2.5 px-3 lg:px-4 bg-transparent border-none text-base-content cursor-pointer text-left text-sm" onclick={() => (open = !open)}>
    <Settings class="inline w-4 h-4 align-text-bottom" />
    Scan Parameters
    {#if open}
      <ChevronUp class="inline w-4 h-4 align-text-bottom" />
    {:else}
      <ChevronDown class="inline w-4 h-4 align-text-bottom" />
    {/if}
  </button>

  {#if open}
    <div data-testid="threshold-controls-body" class="flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:gap-5 px-3 lg:px-4 pt-3 pb-4">
      <label class="flex flex-col gap-1 text-base-content/60 text-sm lg:min-w-40">
        Price threshold: {thresholds.price_threshold}×
        <div class="flex items-center gap-2">
          <input type="range" class="range range-sm flex-1" min="1.2" max="5.0" step="0.1"
            value={thresholds.price_threshold}
            oninput={(e) => emit({ price_threshold: Number((e.target as HTMLInputElement).value) })}
          />
          <input type="number" class="input input-sm w-16" min="1.2" max="5.0" step="0.1"
            value={thresholds.price_threshold}
            onchange={(e) => clampEmit('price_threshold', Number((e.target as HTMLInputElement).value), 1.2, 5.0)}
          />
        </div>
      </label>

      <label class="flex flex-col gap-1 text-base-content/60 text-sm lg:min-w-40">
        Days of supply: {thresholds.days_of_supply}
        <div class="flex items-center gap-2">
          <input type="range" class="range range-sm flex-1" min="1" max="14" step="1"
            value={thresholds.days_of_supply}
            oninput={(e) => emit({ days_of_supply: Number((e.target as HTMLInputElement).value) })}
          />
          <input type="number" class="input input-sm w-16" min="1" max="14" step="1"
            value={thresholds.days_of_supply}
            onchange={(e) => clampEmit('days_of_supply', Number((e.target as HTMLInputElement).value), 1, 14)}
          />
        </div>
      </label>

      <label class="flex flex-row items-center gap-2 text-base-content/60 text-sm">
        <input type="checkbox" class="checkbox checkbox-sm"
          checked={thresholds.hq}
          onchange={(e) => emit({ hq: (e.target as HTMLInputElement).checked })}
        />
        HQ only
      </label>

      <label class="flex flex-col gap-1 text-base-content/60 text-sm">
        Results:
        <select class="select select-sm"
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
