<script lang="ts">
  import type { CraftingNode } from '$lib/shared/types'
  import { formatGil, confidenceColor } from '$lib/shared/format'
  import { getIconUrl, resolveDisplayName, subscribe } from '$lib/client/xivapi.ts'
  import CopyButton from './CopyButton.svelte'

  let { node, depth = 0 }: { node: CraftingNode; depth?: number } = $props()

  const hasRecipe = $derived(!!node.recipe)
  let expanded = $state(node.action === 'craft')

  const isCraftNode = $derived(node.action === 'craft' && hasRecipe)
  const isBuyWithRecipe = $derived(node.action !== 'craft' && hasRecipe)
  const isVendor = $derived(node.action === 'vendor')
  const isExpandable = $derived(isCraftNode || isBuyWithRecipe)

  const showConfidenceDot = $derived(!isVendor)
  const nodeConfidenceColor = $derived(confidenceColor(node.confidence))

  const alternativeText = $derived.by(() => {
    if (node.action === 'craft' && node.marketPrice != null) {
      const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
      return `buy ${formatGil(node.marketPrice)}${world}`
    }
    if (node.action === 'buy' && node.craftCost != null) {
      return `craft ${formatGil(node.craftCost)}`
    }
    if (node.action === 'vendor' && node.marketPrice != null) {
      const world = node.marketWorld ? ` @ ${node.marketWorld}` : ''
      return `buy ${formatGil(node.marketPrice)}${world}`
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

  const displayName = $derived.by(() => { void nameGeneration; return resolveDisplayName(node.itemId, node.itemName) })
  const iconUrl = $derived.by(() => { void nameGeneration; return getIconUrl(node.itemId) })

  function toggleExpand() {
    expanded = !expanded
  }

  const indent = $derived(depth * 20)
</script>

<!-- Node row -->
<div
  class="flex items-center gap-2 py-1 px-2 rounded {isExpandable ? 'mb-0.5' : 'mb-px'}"
  class:bg-success-5={isCraftNode}
  class:bg-primary-5={isBuyWithRecipe}
  style="padding-left: {indent + 8}px"
  data-testid={isCraftNode ? 'craft-node' : isBuyWithRecipe ? 'buy-recipe-node' : isVendor ? 'vendor-leaf' : 'buy-leaf'}
>
  {#if isExpandable}
    <button
      class="text-xs font-bold w-3.5 shrink-0 cursor-pointer {isCraftNode ? 'text-success' : 'text-primary'}"
      onclick={toggleExpand}
    >
      {expanded ? '▼' : '▶'}
    </button>
  {:else}
    <span class="w-3.5 shrink-0"></span>
  {/if}

  {#if iconUrl}
    <img src={iconUrl} alt="" class="w-5 h-5 rounded-sm shrink-0"
      onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
  {:else}
    <div class="w-5 h-5 rounded-sm bg-base-300 shrink-0"></div>
  {/if}

  <div class="flex-1 min-w-0 flex items-center gap-1">
    {#if isVendor}
      <span class="text-base-content/80 text-xs min-w-0 truncate">{displayName}</span>
    {:else}
      <a href="/item/{node.itemId}" class="text-primary text-xs hover:underline min-w-0 truncate">{displayName}</a>
    {/if}
    {#if node.amount > 1}
      <span class="text-base-content/80 text-xs shrink-0">×{node.amount}</span>
    {/if}
    <span class="hidden lg:inline-flex">
      <CopyButton text={displayName} />
    </span>
  </div>

  <span class="text-[9px] px-1.5 py-px rounded shrink-0
    {isCraftNode ? 'bg-success/15 text-success' : isVendor ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'}">
    {actionBadgeText}
  </span>
  {#if alternativeText}
    <span class="text-base-content/40 text-[9px] shrink-0">{alternativeText}</span>
  {/if}
  {#if showConfidenceDot}
    <span
      class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style="background:{nodeConfidenceColor}"
      data-testid="confidence-dot"
    ></span>
  {/if}
  <span class="text-xs font-bold min-w-[50px] text-right shrink-0">{formatGil(node.totalCost)}</span>
</div>

<!-- Children (flat — rendered as siblings, not nested inside the node) -->
{#if expanded && node.recipe}
  {#each node.recipe.ingredients as child}
    <svelte:self node={child} depth={depth + 1} />
  {/each}
{/if}

<style>
  .bg-success-5 { background: oklch(from var(--color-success) l c h / 0.05); }
  .bg-primary-5 { background: oklch(from var(--color-primary) l c h / 0.05); }
</style>
