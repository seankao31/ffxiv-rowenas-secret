<!-- src/client/components/StaleBadge.svelte -->
<script lang="ts">
  const { confidence, ageHours }: { confidence: number; ageHours: number } = $props()

  const colour = $derived(
    confidence >= 0.85 ? '🟢' :
    confidence >= 0.60 ? '🟡' :
    confidence >= 0.25 ? '🟠' : '🔴'
  )

  const label = $derived(
    ageHours < 1
      ? `${Math.round(ageHours * 60)}min ago`
      : `${ageHours.toFixed(1)}h ago`
  )
</script>

<span title="Data age: {label}">{colour} {label}</span>
