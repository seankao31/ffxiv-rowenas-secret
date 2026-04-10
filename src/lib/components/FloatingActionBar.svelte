<script lang="ts">
  import type { Opportunity } from '$lib/shared/types'

  const {
    selectedIds,
    opportunities,
    onplanroute,
    onclear,
  }: {
    selectedIds: Set<number>
    opportunities: Opportunity[]
    onplanroute: () => void
    onclear: () => void
  } = $props()

  const selected = $derived(
    opportunities.filter(o => selectedIds.has(o.itemID))
  )

  const estimatedProfit = $derived(
    selected.reduce((sum, o) => sum + o.profitPerUnit * o.recommendedUnits, 0)
  )

  const fmt = (n: number) => n.toLocaleString()
</script>

{#if selected.length > 0}
  <div
    data-testid="floating-action-bar"
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-5 py-3 bg-base-200 border border-primary/30 rounded-lg shadow-lg"
  >
    <span class="font-semibold text-primary text-sm">{selected.length} item{selected.length > 1 ? 's' : ''} selected</span>
    <span class="text-base-content/30">·</span>
    <span class="text-base-content/60 text-sm">Est. profit: <span class="text-success">{fmt(estimatedProfit)} gil</span></span>
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      onclick={onclear}
    >Clear</button>
    <button
      type="button"
      class="btn btn-primary btn-sm"
      onclick={onplanroute}
    >Plan Route</button>
  </div>
{/if}
