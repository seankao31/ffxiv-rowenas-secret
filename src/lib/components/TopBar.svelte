<script lang="ts">
  import { page } from '$app/state'
  import { navItems } from '$lib/client/navigation.ts'

  const currentTool = $derived(
    navItems.find(item => page.url.pathname.startsWith(`/${item.id}`))?.label ?? ''
  )
</script>

<header class="h-12 flex items-center justify-between px-4 bg-base-200 border-b border-base-300 shrink-0">
  <div class="flex items-center gap-2">
    <span class="text-lg text-accent font-semibold">羅薇娜的商業機密</span>
    <span class="text-xs text-base-content/30">{__APP_VERSION__}</span>
    <span class="text-base-content/30">/</span>
    <span class="text-base-content/70">{currentTool}</span>
  </div>
  <div class="text-base-content/40 text-sm">
  </div>
</header>
