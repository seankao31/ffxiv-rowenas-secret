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
  const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
  const fmtCompact = (n: number) => compactFmt.format(n)
</script>

{#if selected.length > 0}
  <div
    data-testid="floating-action-bar"
    class="fixed bottom-4 lg:bottom-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-6 py-4 bg-base-200 border border-primary/30 rounded-lg shadow-lg"
  >
    <span class="font-semibold text-primary">{selected.length} item{selected.length > 1 ? 's' : ''} <span class="hidden lg:inline">selected</span></span>
    <span class="text-base-content/30">·</span>
    <span class="hidden lg:inline text-base-content/60">Est. profit: <span class="text-success">{fmt(estimatedProfit)} gil</span></span>
    <span class="lg:hidden text-base-content/60"><span class="text-success">{fmtCompact(estimatedProfit)} gil</span></span>
    <button
      type="button"
      class="btn btn-ghost"
      onclick={onclear}
    >Clear</button>
    <button
      type="button"
      class="btn btn-primary"
      onclick={onplanroute}
    >Plan Route</button>
  </div>
{/if}
