<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte'
  import { navItems } from '../client/navigation.ts'

  let { expanded, ontoggle }: {
    expanded: boolean
    ontoggle: () => void
  } = $props()

</script>

<nav
  class="relative bg-base-200 border-r border-base-300 shrink-0 flex flex-col transition-[width] duration-200"
  style:width={expanded ? '220px' : '56px'}
>
  <button
    onclick={ontoggle}
    class="absolute -right-3.5 top-4 z-10 w-7 h-7 rounded-full bg-base-300 border border-base-content/10 flex items-center justify-center hover:bg-accent hover:text-accent-content transition-colors cursor-pointer"
  >
    {#if expanded}
      <ChevronLeft class="w-4 h-4" />
    {:else}
      <ChevronRight class="w-4 h-4" />
    {/if}
  </button>

  <div class="flex-1 overflow-y-auto pt-4">
    {#each navItems as item (item.id)}
      {@const Icon = item.icon}
      {@const active = true}
      {#if expanded}
        <a
          href="/{item.id}"
          class="flex items-center gap-3 px-4 py-2 text-sm no-underline transition-colors {active
            ? 'border-l-2 border-accent bg-accent/10 text-accent'
            : 'text-base-content/60 hover:bg-base-300'}"
        >
          <Icon class="w-5 h-5 shrink-0" />
          <span>{item.label}</span>
        </a>
      {:else}
        <a
          href="/{item.id}"
          class="flex items-center justify-center py-2 mx-2 rounded-lg no-underline transition-colors {active
            ? 'bg-accent text-accent-content'
            : 'text-base-content/60 hover:bg-base-300'}"
          title={item.label}
        >
          <Icon class="w-5 h-5" />
        </a>
      {/if}
    {/each}
  </div>
</nav>
