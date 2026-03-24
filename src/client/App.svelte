<!-- src/client/App.svelte -->
<script lang="ts">
  import { fetchOpportunities, type Opportunity, type ScanMeta, type ThresholdState } from './lib/api.ts'
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
      if (result === null) {
        coldStart = true
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
    const interval = setInterval(loadData, 30_000)
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
      <p class="msg">⏳ Initial scan in progress — first results in ~2 min…</p>
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
</style>
