<!-- src/client/App.svelte -->
<script lang="ts">
  import { fetchOpportunities, type Opportunity, type ScanMeta, type ScanProgress, type ThresholdState } from './lib/api.ts'
  import StatusBar from './components/StatusBar.svelte'
  import ThresholdControls from './components/ThresholdControls.svelte'
  import OpportunityTable from './components/OpportunityTable.svelte'

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
    loadData()
    // Poll faster during cold start (2s) for smooth progress updates, normal 30s otherwise
    const ms = coldStart ? 2_000 : 30_000
    const interval = setInterval(loadData, ms)
    return () => clearInterval(interval)
  })
</script>

<div class="app">
  {#if meta.scanCompletedAt > 0}
    <StatusBar {meta} />
  {/if}

  <ThresholdControls {thresholds} onchange={onThresholdChange} />

  <main>
    {#if coldStart}
      {@const pct = scanProgress.totalBatches > 0
        ? Math.round((scanProgress.completedBatches / scanProgress.totalBatches) * 100)
        : 0}
      <div class="cold-start">
        <p class="msg">Initial scan in progress…</p>
        <div class="progress-track">
          <div class="progress-fill" style="width: {pct}%"></div>
        </div>
        <p class="progress-label">{scanProgress.phase || 'Starting…'} — {pct}%</p>
      </div>
    {:else if loading}
      <p class="msg">Loading…</p>
    {:else if error}
      <p class="msg err">Error: {error}</p>
    {:else if opportunities.length === 0}
      <p class="msg">No opportunities found with current filters.</p>
    {:else}
      <OpportunityTable {opportunities} />
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #0f0f1a; font-family: system-ui, sans-serif; }
  .app { min-height: 100vh; }
  .msg { padding: 32px; color: #666; text-align: center; }
  .err { color: #ff6b6b; }
  .cold-start { padding: 48px 32px; text-align: center; }
  .cold-start .msg { padding: 0 0 16px; }
  .progress-track {
    max-width: 400px;
    margin: 0 auto;
    height: 8px;
    background: #1a1a2e;
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #4a6cf7;
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .progress-label {
    margin-top: 12px;
    color: #555;
    font-size: 0.85rem;
  }
</style>
