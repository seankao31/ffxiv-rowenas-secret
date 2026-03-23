<!-- src/client/components/StatusBar.svelte -->
<script lang="ts">
  import type { ScanMeta } from '../lib/api.ts'

  const { meta }: { meta: ScanMeta } = $props()

  let secondsUntilNext = $state(0)
  let lastScanLabel = $state('never')
  let isStale = $state(false)
  let isVeryStale = $state(false)

  // Single interval updates all time-dependent display state every second
  $effect(() => {
    const update = () => {
      const now = Date.now()
      secondsUntilNext = Math.max(0, Math.round((meta.nextScanEstimatedAt - now) / 1000))
      if (meta.scanCompletedAt === 0) {
        lastScanLabel = 'never'
        isStale = false
        isVeryStale = false
        return
      }
      const s = Math.round((now - meta.scanCompletedAt) / 1000)
      lastScanLabel = s < 60 ? `${s}s ago` : `${Math.round(s / 60)}min ago`
      isStale = now - meta.scanCompletedAt > 10 * 60_000
      isVeryStale = now - meta.scanCompletedAt > 30 * 60_000
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  })
</script>

{#if isVeryStale}
  <div class="bar severe">⚠️ Data very outdated — last scan {lastScanLabel}</div>
{:else if isStale}
  <div class="bar stale">⚠️ Data may be outdated — last scan {lastScanLabel}</div>
{:else}
  <div class="bar">
    Last scan: {lastScanLabel} · Next in: {secondsUntilNext}s · {meta.itemsWithOpportunities} opportunities
  </div>
{/if}

<style>
  .bar        { padding: 8px 16px; background: #1a1a2e; color: #aaa; font-size: 13px; }
  .stale      { background: #3a2a00; color: #ffc107; }
  .severe     { background: #3a0000; color: #ff6b6b; }
</style>
