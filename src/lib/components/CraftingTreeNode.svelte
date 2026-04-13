<script lang="ts">
  import type { CraftingNode } from '$lib/shared/types'
  import { getIconUrl, getEnglishName, subscribe } from '$lib/client/xivapi.ts'

  let { node, depth = 0 }: { node: CraftingNode; depth?: number } = $props()

  const hasRecipe = $derived(!!node.recipe)
  let expanded = $state(node.action === 'craft')

  const isCraftNode = $derived(node.action === 'craft' && hasRecipe)
  const isBuyWithRecipe = $derived(node.action !== 'craft' && hasRecipe)
  const isVendor = $derived(node.action === 'vendor')

  const showConfidenceDot = $derived(!isVendor)
  const confidenceColor = $derived.by(() => {
    if (node.confidence >= 0.85) return '#5b5'
    if (node.confidence >= 0.60) return '#cb3'
    if (node.confidence >= 0.25) return '#e83'
    return '#d44'
  })

  const alternativeText = $derived.by(() => {
    if (node.action === 'craft' && node.marketPrice != null) {
      const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
      return `buy ${node.marketPrice.toLocaleString()}${world}`
    }
    if (node.action === 'buy' && node.craftCost != null) {
      return `craft ${node.craftCost.toLocaleString()}`
    }
    if (node.action === 'vendor' && node.marketPrice != null) {
      const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
      return `buy ${node.marketPrice.toLocaleString()}${world}`
    }
    return null
  })

  const actionBadgeText = $derived.by(() => {
    if (node.action === 'craft') return 'craft'
    if (node.action === 'vendor') return 'vendor'
    const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
    return `buy${world}`
  })

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  const displayName = $derived.by(() => { void nameGeneration; return getEnglishName(node.itemId) ?? `Item #${node.itemId}` })
  const iconUrl = $derived.by(() => { void nameGeneration; return getIconUrl(node.itemId) })

  function toggleExpand() {
    expanded = !expanded
  }

  function formatGil(n: number): string {
    return n.toLocaleString()
  }
</script>

{#if isCraftNode || isBuyWithRecipe}
  <div
    class="mb-1.5 border border-base-300 rounded-lg p-2 {isCraftNode ? 'bg-success/[0.04]' : 'bg-primary/[0.04]'}"
    data-testid={isCraftNode ? 'craft-node' : 'buy-recipe-node'}
  >
    <div class="flex items-center gap-2">
      <button
        class="text-xs font-bold w-3.5 shrink-0 {isCraftNode ? 'text-success' : 'text-primary'}"
        onclick={toggleExpand}
      >
        {expanded ? '▼' : '▶'}
      </button>
      {#if iconUrl}
        <img src={iconUrl} alt="" class="w-5 h-5 rounded-sm shrink-0"
          onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      {:else}
        <div class="w-5 h-5 rounded-sm bg-base-300 shrink-0"></div>
      {/if}
      <a href="/item/{node.itemId}" class="text-primary text-xs hover:underline flex-1 min-w-0 truncate">
        {displayName}{#if node.amount > 1}<span class="text-base-content/40"> ×{node.amount}</span>{/if}
      </a>
      <span class="text-[9px] px-1.5 py-px rounded {isCraftNode ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'}">
        {actionBadgeText}
      </span>
      {#if alternativeText}
        <span class="text-base-content/40 text-[9px]">{alternativeText}</span>
      {/if}
      {#if showConfidenceDot}
        <span
          class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style="background:{confidenceColor}"
          data-testid="confidence-dot"
        ></span>
      {/if}
      <span class="text-xs font-bold min-w-[50px] text-right">{formatGil(node.totalCost)}</span>
    </div>

    {#if expanded && node.recipe}
      <div class="ml-3.5 lg:ml-4 mt-1.5 border-l border-base-300 pl-2.5">
        {#each node.recipe.ingredients as child}
          <svelte:self node={child} depth={depth + 1} />
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div
    class="mb-0.5 flex items-center gap-2 py-1 px-1"
    data-testid={isVendor ? 'vendor-leaf' : 'buy-leaf'}
  >
    <span class="w-3.5 shrink-0"></span>
    {#if iconUrl}
      <img src={iconUrl} alt="" class="w-[18px] h-[18px] rounded-sm shrink-0"
        onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
    {:else}
      <div class="w-[18px] h-[18px] rounded-sm bg-base-300 shrink-0"></div>
    {/if}
    {#if isVendor}
      <span class="text-base-content/80 text-xs flex-1 min-w-0 truncate">
        {displayName}{#if node.amount > 1}<span class="text-base-content/40"> ×{node.amount}</span>{/if}
      </span>
    {:else}
      <a href="/item/{node.itemId}" class="text-primary text-xs hover:underline flex-1 min-w-0 truncate">
        {displayName}{#if node.amount > 1}<span class="text-base-content/40"> ×{node.amount}</span>{/if}
      </a>
    {/if}
    <span class="text-[9px] px-1.5 py-px rounded {isVendor ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'}">
      {actionBadgeText}
    </span>
    {#if showConfidenceDot}
      <span
        class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style="background:{confidenceColor}"
        data-testid="confidence-dot"
      ></span>
    {/if}
    <span class="text-xs font-bold min-w-[50px] text-right">{formatGil(node.totalCost)}</span>
  </div>
{/if}
