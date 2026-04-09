<script lang="ts">
  import { page } from '$app/state'
  import { Menu } from 'lucide-svelte'
  import { navItems } from '$lib/client/navigation.ts'

  let { onmenuclick }: { onmenuclick?: () => void } = $props()

  const currentTool = $derived(
    navItems.find(item => page.url.pathname.startsWith(`/${item.id}`))?.label ?? ''
  )
</script>

<header class="h-12 flex items-center justify-between px-3 lg:px-4 bg-base-200 border-b border-base-300 shrink-0">
  <div class="flex items-center gap-2">
    {#if onmenuclick}
      <button onclick={onmenuclick} class="lg:hidden p-1 -ml-1" aria-label="Open menu">
        <Menu class="w-5 h-5" />
      </button>
    {/if}
    <span class="text-lg text-accent font-semibold">羅薇娜的商業機密</span>
    <span class="hidden lg:inline text-xs text-base-content/30">{__APP_VERSION__}</span>
    <span class="hidden lg:inline text-base-content/30">/</span>
    <span class="hidden lg:inline text-base-content/70">{currentTool}</span>
  </div>
  <div class="text-base-content/40 text-sm">
  </div>
</header>
