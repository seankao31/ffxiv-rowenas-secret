<script lang="ts">
  import { Heart } from 'lucide-svelte'
  import TopBar from '$lib/components/TopBar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import { loadSidebarExpanded, saveSidebarExpanded } from '$lib/client/sidebar.ts'
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()

  let expanded = $state(loadSidebarExpanded())

  function toggleSidebar() {
    expanded = !expanded
    saveSidebarExpanded(expanded)
  }
</script>

<div class="flex flex-col h-screen overflow-hidden">
  <TopBar toolName="Arbitrage" />

  <div class="flex flex-1 min-h-0">
    <Sidebar {expanded} ontoggle={toggleSidebar} />

    <div class="flex-1 flex flex-col min-h-0">
      <div class="ad-zone w-full shrink-0"></div>

      <div class="flex-1 flex flex-col min-h-0 max-w-[1400px] w-full mx-auto px-8 box-border">
        {@render children()}
      </div>
    </div>
  </div>

  <footer class="shrink-0 p-5 px-8 text-center text-base-content/40 text-xs border-t border-base-300">
    <p class="my-1">Built with <Heart class="inline w-3.5 h-3.5 align-text-bottom text-error" fill="currentColor" /> by <a class="link link-info no-underline hover:underline" href="https://yhkao.com" target="_blank" rel="noopener">Yshan</a></p>
    <p class="my-1">Data sourced from <a class="link link-info no-underline hover:underline" href="https://universalis.app" target="_blank" rel="noopener">Universalis</a></p>
    <p class="my-1 text-base-content/30 text-[11px]">FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. © SQUARE ENIX CO., LTD. All Rights Reserved.</p>
  </footer>
</div>
