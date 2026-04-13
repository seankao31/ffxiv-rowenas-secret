<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { Heart } from 'lucide-svelte'
  import { afterNavigate } from '$app/navigation'
  import { PUBLIC_GA_MEASUREMENT_ID } from '$env/static/public'
  import TopBar from '$lib/components/TopBar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import NavDrawer from '$lib/components/NavDrawer.svelte'
  import { loadSidebarExpanded, saveSidebarExpanded } from '$lib/client/sidebar.ts'

  let { children } = $props()

  onMount(() => {
    if (!PUBLIC_GA_MEASUREMENT_ID) return
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${PUBLIC_GA_MEASUREMENT_ID}`
    document.head.appendChild(script)
    window.dataLayer = window.dataLayer || []
    function gtag(...args: unknown[]) { window.dataLayer.push(args) }
    window.gtag = gtag
    gtag('js', new Date())
    gtag('config', PUBLIC_GA_MEASUREMENT_ID, { send_page_view: false })
  })

  afterNavigate(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_title: document.title,
        page_location: location.href,
      })
    }
  })

  let expanded = $state(loadSidebarExpanded())
  let drawerOpen = $state(false)

  $effect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) drawerOpen = false
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  })

  function toggleSidebar() {
    expanded = !expanded
    saveSidebarExpanded(expanded)
  }
</script>

<div class="flex flex-col h-screen overflow-hidden">
  <TopBar onmenuclick={() => drawerOpen = true} />

  <div class="flex flex-1 min-h-0">
    <div class="hidden lg:flex">
      <Sidebar {expanded} ontoggle={toggleSidebar} />
    </div>

    <div class="flex-1 flex flex-col min-h-0 min-w-0">
      <div class="ad-zone w-full shrink-0"></div>

      <div class="flex-1 flex flex-col min-h-0 min-w-0 max-w-[1400px] w-full mx-auto px-3 lg:px-8 box-border">
        {@render children()}
      </div>
    </div>
  </div>

  <NavDrawer open={drawerOpen} onclose={() => drawerOpen = false} />

  <footer class="shrink-0 p-5 px-3 lg:px-8 text-center text-base-content/40 text-xs border-t border-base-300">
    <p class="my-1">Built with <Heart class="inline w-3.5 h-3.5 align-text-bottom text-error" fill="currentColor" /> by <a class="link link-info no-underline hover:underline" href="https://yhkao.com" target="_blank" rel="noopener">Yshan</a></p>
    <p class="my-1">Data sourced from <a class="link link-info no-underline hover:underline" href="https://universalis.app" target="_blank" rel="noopener">Universalis</a></p>
    <p class="my-1 text-base-content/30 text-[11px]">FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. © SQUARE ENIX CO., LTD. All Rights Reserved.</p>
  </footer>
</div>
