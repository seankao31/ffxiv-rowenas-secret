<!-- src/client/components/StatusBar.svelte -->
<script lang="ts">
  import type { ScanMeta } from '../lib/api.ts'

  const { meta, flash }: {
    meta: ScanMeta
    flash: boolean
  } = $props()

  let lastScanLabel = $state('never')
  let isStale = $state(false)
  let isVeryStale = $state(false)

  // Single interval updates all time-dependent display state every second
  $effect(() => {
    const update = () => {
      if (meta.scanCompletedAt === 0) {
        lastScanLabel = 'never'
        isStale = false
        isVeryStale = false
        return
      }
      const now = Date.now()
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
  <div role="alert" class="alert alert-error text-sm py-2 px-4 rounded-none">
    ⚠️ Data very outdated — last scan {lastScanLabel}
  </div>
{:else if isStale}
  <div role="alert" class="alert alert-warning text-sm py-2 px-4 rounded-none">
    ⚠️ Data may be outdated — last scan {lastScanLabel}
  </div>
{:else}
  <div class="py-2 px-4 bg-base-200 text-base-content/60 text-sm">
    <span class:animate-pulse-bright={flash}>Last scan: {lastScanLabel}</span>
  </div>
{/if}
