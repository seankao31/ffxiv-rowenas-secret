<script lang="ts">
  import { page } from '$app/state'
  import { navItems } from '$lib/client/navigation.ts'

  let { open, onclose }: {
    open: boolean
    onclose: () => void
  } = $props()

  const isActive = (id: string) => page.url.pathname.startsWith(`/${id}`)

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onkeydown} />

{#if open}
  <div
    data-testid="nav-drawer"
    class="fixed inset-0 z-40"
  >
    <!-- Backdrop -->
    <button
      data-testid="nav-drawer-backdrop"
      class="absolute inset-0 bg-black/50 cursor-default"
      onclick={onclose}
      aria-label="Close menu"
      tabindex="-1"
    ></button>

    <!-- Panel -->
    <nav class="absolute top-0 left-0 h-full w-[280px] bg-base-200 border-r border-base-300 flex flex-col overflow-y-auto">
      <div class="px-4 py-4 text-lg text-accent font-semibold border-b border-base-300">
        羅薇娜的商業機密
      </div>

      <div class="flex-1 pt-2">
        {#each navItems as item (item.id)}
          {@const Icon = item.icon}
          <a
            href="/{item.id}"
            onclick={onclose}
            class="flex items-center gap-3 px-4 py-3 text-sm no-underline transition-colors {isActive(item.id)
              ? 'border-l-2 border-accent bg-accent/10 text-accent'
              : 'text-base-content/60 hover:bg-base-300'}"
          >
            <Icon class="w-5 h-5 shrink-0" />
            <span>{item.label}</span>
          </a>
        {/each}
      </div>
    </nav>
  </div>
{/if}
