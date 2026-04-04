<!-- src/client/App.svelte -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { fetchOpportunities, type Opportunity, type ScanMeta, type ScanProgress, type ThresholdState } from '$lib/client/api.ts'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import ThresholdControls from '$lib/components/ThresholdControls.svelte'
  import OpportunityTable from '$lib/components/OpportunityTable.svelte'

  let opportunities = $state<Opportunity[]>([])
  let meta = $state<ScanMeta>({
    scanCompletedAt: 0,
    itemsScanned: 0,
    itemsWithOpportunities: 0,
    nextScanEstimatedAt: 0,
  })
  let loading = $state(true)
  let coldStart = $state(false)
  let scanProgress = $state<ScanProgress>({ phase: '', completedBatches: 0, totalBatches: 0 })
  let error = $state<string | null>(null)
  let thresholds = $state<ThresholdState>({
    price_threshold: 2.0,
    listing_staleness_hours: 48,
    days_of_supply: 3,
    limit: 50,
    hq: false,
  })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let flash = $state(false)

  async function loadData() {
    try {
      error = null
      const result = await fetchOpportunities(thresholds)
      if ('ready' in result) {
        coldStart = true
        scanProgress = result.progress
        loading = false
        return
      }
      coldStart = false
      // Flash timestamp when background poll detects a new scan
      if (meta.scanCompletedAt > 0 && result.meta.scanCompletedAt !== meta.scanCompletedAt) {
        flash = false
        // Force a tick so Svelte removes the class before re-adding it
        await new Promise(r => requestAnimationFrame(r))
        flash = true
      }
      opportunities = result.opportunities
      meta = result.meta
      loading = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      loading = false
    }
  }

  function onThresholdChange(next: ThresholdState) {
    thresholds = next
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadData, 500)
  }

  $effect(() => {
    // Poll faster during cold start (2s) for smooth progress updates, normal 30s otherwise
    const ms = coldStart ? 2_000 : 30_000
    // untrack: loadData reads thresholds, but this effect should only react to coldStart changes.
    // Threshold-driven fetches go through the debounced onThresholdChange path instead.
    untrack(() => loadData())
    const interval = setInterval(loadData, ms)
    return () => clearInterval(interval)
  })
</script>

{#if meta.scanCompletedAt > 0}
  <StatusBar {meta} {flash} />
{/if}

<ThresholdControls {thresholds} onchange={onThresholdChange} />

<main class="flex-1 flex flex-col min-h-0">
  {#if coldStart}
    {@const pct = scanProgress.totalBatches > 0
      ? Math.round((scanProgress.completedBatches / scanProgress.totalBatches) * 100)
      : 0}
    <div class="py-12 px-8 text-center">
      <p class="pb-4 text-base-content/50 text-center">Initial scan in progress…</p>
      <progress class="progress progress-primary w-full max-w-sm mx-auto block" value={pct} max="100"></progress>
      <p class="mt-3 text-base-content/40 text-sm">{scanProgress.phase || 'Starting…'} — {pct}%</p>
    </div>
  {:else if loading}
    <p class="p-8 text-base-content/50 text-center">Loading…</p>
  {:else if error}
    <p class="p-8 text-error text-center">Error: {error}</p>
  {:else if opportunities.length === 0}
    <p class="p-8 text-base-content/50 text-center">No opportunities found with current filters.</p>
  {:else}
    <p class="mt-3 mb-1 text-base-content/50 text-sm shrink-0">Showing {opportunities.length} opportunities</p>
    <OpportunityTable {opportunities} />
  {/if}
</main>
