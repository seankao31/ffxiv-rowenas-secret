<script lang="ts">
  let { toolName }: { toolName: string } = $props()
</script>

<header class="h-12 flex items-center justify-between px-4 bg-base-200 border-b border-base-300 shrink-0">
  <div class="flex items-center gap-2 text-sm">
    <span class="text-accent font-semibold">羅薇娜的商業機密</span>
    <span class="text-base-content/30">/</span>
    <span class="text-base-content/70">{toolName}</span>
  </div>
  <div class="text-base-content/40 text-sm">
  </div>
</header>
