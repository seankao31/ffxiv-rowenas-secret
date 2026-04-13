<script lang="ts">
  import type { CraftingResult, CraftingNode as CraftingNodeType } from '$lib/shared/types'
  import { formatGil, confidenceColor, confidenceLabel } from '$lib/shared/format'
  import { fetchItemMetadata, subscribe } from '$lib/client/xivapi.ts'
  import CraftingTreeNode from './CraftingTreeNode.svelte'

  let { itemId }: { itemId: number } = $props()

  let result = $state<CraftingResult | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let cacheNotReady = $state(false)

  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  function collectItemIds(node: CraftingNodeType): number[] {
    const ids = [node.itemId]
    if (node.recipe) {
      for (const child of node.recipe.ingredients) {
        ids.push(...collectItemIds(child))
      }
    }
    return ids
  }

  async function fetchCraftData() {
    loading = true
    error = null
    cacheNotReady = false
    try {
      const res = await fetch(`/api/craft/${itemId}`)
      if (res.status === 202) {
        cacheNotReady = true
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed with status ${res.status}`)
      }
      const data = await res.json()
      // Await metadata before setting result so the XIVAPI name cache is populated
      // when tree nodes first render. Without this, nodes mount showing "Item #ID"
      // because the subscribe notification fires before they register listeners.
      const ids = collectItemIds(data.root)
      await fetchItemMetadata([...new Set(ids)])
      result = data
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to load crafting data'
    } finally {
      loading = false
    }
  }

  $effect(() => { fetchCraftData() })

  const confidencePercent = $derived(result ? Math.round(result.confidence * 100) : 0)
  const confLabel = $derived(result ? confidenceLabel(result.confidence) : '')
  const confColor = $derived(result ? confidenceColor(result.confidence) : '#5b5')

  const isCraftRecommended = $derived(result?.root.action === 'craft')
  const savings = $derived.by(() => {
    if (!result?.cheapestListing) return null
    return result.cheapestListing.price - result.totalCost
  })
</script>

<div class="flex justify-center">
  <div class="w-full max-w-[520px]">
    {#if loading}
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <div class="skeleton h-5 w-48 mb-3"></div>
          <div class="flex gap-4">
            <div class="skeleton h-10 w-24"></div>
            <div class="skeleton h-10 w-24"></div>
            <div class="skeleton h-10 w-24"></div>
          </div>
        </div>
      </div>
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <div class="skeleton h-4 w-32 mb-3"></div>
          {#each { length: 4 } as _}
            <div class="skeleton h-8 w-full mb-1.5"></div>
          {/each}
        </div>
      </div>
    {:else if cacheNotReady}
      <div class="card bg-base-200">
        <div class="card-body items-center text-center p-8">
          <span class="loading loading-spinner loading-md"></span>
          <p class="text-base-content/50 text-sm mt-2">Market data still loading...</p>
          <button class="btn btn-sm btn-ghost mt-2" onclick={fetchCraftData}>Retry</button>
        </div>
      </div>
    {:else if error}
      <div class="card bg-base-200">
        <div class="card-body items-center text-center p-8">
          <p class="text-error text-sm">{error}</p>
          <button class="btn btn-sm btn-ghost mt-2" onclick={fetchCraftData}>Retry</button>
        </div>
      </div>
    {:else if result}
      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold {isCraftRecommended ? 'text-success' : 'text-primary'}">
              ⚒ Recommendation: {isCraftRecommended ? 'Craft' : 'Buy'}
            </span>
            <span class="text-xs px-2.5 py-0.5 rounded-full"
              style="background:{confColor}20;color:{confColor}">
              {confidencePercent}% confidence
            </span>
          </div>
          <div class="flex flex-wrap gap-5 text-xs items-baseline">
            <div>
              <span class="text-base-content/50">Craft cost</span><br>
              <span class="font-bold text-base {isCraftRecommended ? 'text-success' : ''}">{formatGil(result.totalCost)}</span>
            </div>
            <span class="text-base-content/30 text-sm">vs</span>
            {#if result.cheapestListing}
              <div>
                <span class="text-base-content/50">Buy cheapest</span><br>
                <span class="font-bold text-base {!isCraftRecommended ? 'text-primary' : ''}">{formatGil(result.cheapestListing.price)}</span>
                <span class="text-base-content/40 text-[10px]">@ {result.cheapestListing.world}</span>
              </div>
            {:else}
              <div>
                <span class="text-base-content/50">Buy cheapest</span><br>
                <span class="text-base-content/30 text-base">N/A</span>
              </div>
            {/if}
            {#if isCraftRecommended && savings != null && savings > 0}
              <div class="ml-auto">
                <span class="text-base-content/50">You save</span><br>
                <span class="font-bold text-base text-success">{formatGil(savings)}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="card bg-base-200 mb-3">
        <div class="card-body p-4">
          <h2 class="font-bold text-sm mb-3">Recipe Tree</h2>
          <CraftingTreeNode node={result.root} />
        </div>
      </div>

      <div class="card bg-base-200">
        <div class="card-body p-3">
          <div class="flex justify-between items-center text-xs mb-1.5">
            <span class="text-base-content/50">Overall Confidence</span>
            <span class="font-bold" style="color:{confColor}">{confidencePercent}% — {confLabel}</span>
          </div>
          <div class="bg-base-300 rounded-sm h-1">
            <div class="rounded-sm h-1 transition-all" style="background:{confColor};width:{confidencePercent}%"></div>
          </div>
          <div class="flex gap-3 mt-1.5 text-[9px] text-base-content/30">
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#5b5"></span>High</span>
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#cb3"></span>Medium</span>
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#e83"></span>Low</span>
            <span><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:#d44"></span>Stale</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
