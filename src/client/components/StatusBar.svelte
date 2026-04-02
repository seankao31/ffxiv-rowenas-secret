<!-- src/client/components/StatusBar.svelte -->
<script lang="ts">
  import { TriangleAlert } from 'lucide-svelte'
  import type { ScanMeta } from '../lib/api.ts'

  const { meta, flash }: {
    meta: ScanMeta
    flash: boolean
  } = $props()

  let now = $state(Date.now())

  $effect(() => {
    const interval = setInterval(() => { now = Date.now() }, 1000)
    return () => clearInterval(interval)
  })

  let elapsed = $derived(now - meta.scanCompletedAt)

  let lastScanLabel = $derived.by(() => {
    if (meta.scanCompletedAt === 0) return 'never'
    const s = Math.round(elapsed / 1000)
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}min ago`
  })

  let isStale = $derived(meta.scanCompletedAt > 0 && elapsed > 10 * 60_000)
  let isVeryStale = $derived(meta.scanCompletedAt > 0 && elapsed > 30 * 60_000)
</script>

{#if isVeryStale}
  <div role="alert" class="alert alert-error text-sm py-2 px-4 rounded-none">
    <TriangleAlert class="inline w-4 h-4 align-text-bottom" /> Data very outdated — last scan {lastScanLabel}
  </div>
{:else if isStale}
  <div role="alert" class="alert alert-warning text-sm py-2 px-4 rounded-none">
    <TriangleAlert class="inline w-4 h-4 align-text-bottom" /> Data may be outdated — last scan {lastScanLabel}
  </div>
{:else}
  <div class="py-2 px-4 bg-base-200 text-base-content/60 text-sm">
    <span class={[flash && "animate-pulse-bright"]}>Last scan: {lastScanLabel}</span>
  </div>
{/if}
