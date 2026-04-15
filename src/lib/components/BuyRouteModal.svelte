<script lang="ts">
  import { resolveDisplayName, getIconUrl, subscribe, fetchItemMetadata } from '$lib/client/xivapi.ts'
  import CopyButton from './CopyButton.svelte'
  import type { RouteWorldGroup, RouteItem, RouteItemState } from '$lib/client/route'

  const {
    route,
    onclose,
  }: {
    route: RouteWorldGroup[]
    onclose: () => void
  } = $props()

  // Re-render when the xivapi metadata cache updates. Without this, items
  // whose metadata arrives after the modal opens would stay as fallback
  // names/missing icons until the modal closes and reopens. The effect
  // returns the unsubscribe handle so we don't leak the listener on close.
  let nameGeneration = $state(0)
  $effect(() => subscribe(() => nameGeneration++))

  $effect(() => {
    const ids = route.flatMap(g => g.items.map(i => i.itemID))
    if (ids.length > 0) fetchItemMetadata(ids)
  })

  const displayNameOf = (item: RouteItem) => {
    void nameGeneration
    return resolveDisplayName(item.itemID, item.itemName)
  }
  const iconOf = (item: RouteItem) => {
    void nameGeneration
    return getIconUrl(item.itemID)
  }

  // Track item states: key is `${itemID}-${isAlt ? 'alt' : 'primary'}`.
  // State resets on each modal open because the parent remounts this
  // component via `{#if showRouteModal}` — no cross-open persistence.
  let itemStates = $state(new Map<string, RouteItemState>())

  function itemKey(item: RouteItem): string {
    return `${item.itemID}-${item.isAlt ? 'alt' : 'primary'}`
  }

  // Find the matching entry (if primary, find alt; if alt, find primary).
  // Returns both its state-map key and the world group containing it.
  function findLinked(item: RouteItem): { key: string; world: string } | null {
    for (const group of route) {
      for (const other of group.items) {
        if (other.itemID === item.itemID && other.isAlt !== item.isAlt) {
          return { key: itemKey(other), world: group.world }
        }
      }
    }
    return null
  }

  function getState(item: RouteItem): RouteItemState {
    return itemStates.get(itemKey(item)) ?? 'unchecked'
  }

  function getLinkedState(item: RouteItem): RouteItemState {
    const linked = findLinked(item)
    return linked ? (itemStates.get(linked.key) ?? 'unchecked') : 'unchecked'
  }

  function toggleState(item: RouteItem, target: 'bought' | 'missing') {
    const key = itemKey(item)
    const current = itemStates.get(key) ?? 'unchecked'
    const next = new Map(itemStates)
    if (current === target) {
      next.delete(key)
    } else {
      next.set(key, target)
    }
    itemStates = next
  }

  // Derived: is an item effectively dismissed? (its linked partner was bought)
  function isDismissed(item: RouteItem): boolean {
    const linkedState = getLinkedState(item)
    return linkedState === 'bought'
  }

  // Derived: is an alt item promoted? (its linked primary was marked missing)
  function isPromoted(item: RouteItem): boolean {
    if (!item.isAlt) return false
    const linkedState = getLinkedState(item)
    return linkedState === 'missing'
  }

  function groupDoneCount(group: RouteWorldGroup): number {
    return group.items.filter(item => {
      const state = getState(item)
      return state === 'bought' || state === 'missing' || isDismissed(item)
    }).length
  }

  function isGroupDone(group: RouteWorldGroup): boolean {
    return groupDoneCount(group) === group.items.length
  }

  // Counts and totals use primary rows only; alts are duplicate entries
  // for the same selected item and would double-count if included.
  const totalItems = $derived(route.reduce((sum, g) => sum + g.items.filter(i => !i.isAlt).length, 0))
  const totalWorlds = $derived(route.length)
  const totalProfit = $derived(
    route.reduce((sum, g) =>
      sum + g.items
        .filter(i => !i.isAlt)
        .reduce((s, i) => s + i.profitPerUnit * i.recommendedUnits, 0)
    , 0)
  )

  const fmt = (n: number) => n.toLocaleString()

  function confidenceLabel(ageHours: number): { text: string; color: string } {
    if (ageHours < 0.5) return { text: 'fresh', color: 'badge-success' }
    if (ageHours < 3) return { text: `${ageHours.toFixed(1)}h old`, color: 'badge-warning' }
    if (ageHours < 12) return { text: `${ageHours.toFixed(0)}h old`, color: 'badge-warning' }
    return { text: 'stale', color: 'badge-error' }
  }

  function priceDiffPercent(altPrice: number, primaryPrice: number): string {
    const diff = ((altPrice - primaryPrice) / primaryPrice) * 100
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onkeydown} />

<div data-testid="buy-route-modal" class="fixed inset-0 z-50">
  <!-- Backdrop -->
  <button
    data-testid="buy-route-backdrop"
    class="absolute inset-0 bg-black/50 cursor-default"
    onclick={onclose}
    aria-label="Close route"
    tabindex="-1"
  ></button>

  <!-- Modal panel -->
  <div class="absolute inset-4 lg:inset-8 bg-base-100 rounded-lg flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-base-300 flex items-start justify-between shrink-0">
      <div>
        <h2 class="text-lg font-semibold">Buy Route</h2>
        <p class="text-sm text-base-content/50 mt-1">
          {totalItems} item{totalItems !== 1 ? 's' : ''} · {totalWorlds} world{totalWorlds !== 1 ? 's' : ''} · Est. profit: <span class="text-success">{fmt(totalProfit)} gil</span>
        </p>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={onclose}
        aria-label="Close route"
      >✕</button>
    </div>

    <!-- Scrollable body -->
    <div class="flex-1 overflow-y-auto">
      {#each route as group (group.world)}
        {@const done = isGroupDone(group)}
        {@const doneCount = groupDoneCount(group)}
        {@const subtotal = group.items.filter(i => !i.isAlt).reduce((s, i) => s + i.profitPerUnit * i.recommendedUnits, 0)}

        <div class="border-b border-base-300 {!group.isPrimaryGroup ? 'opacity-60' : ''}" data-testid="world-group">
          <!-- World header -->
          <div class="px-5 py-3 bg-base-200/50 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="font-semibold text-info">{group.world}</span>
              <span class="text-xs text-base-content/40">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
              {#if done}
                <span class="badge badge-xs badge-success">✓ done</span>
              {:else if doneCount > 0}
                <span class="text-xs text-base-content/40">{doneCount} of {group.items.length} done</span>
              {/if}
            </div>
            {#if !done}
              <span class="text-xs text-base-content/40">Subtotal: <span class="text-success">{fmt(subtotal)} gil</span></span>
            {/if}
          </div>

          <!-- Items -->
          {#each group.items as item (itemKey(item))}
            {@const state = getState(item)}
            {@const dismissed = isDismissed(item)}
            {@const promoted = isPromoted(item)}
            {@const conf = confidenceLabel(item.sourceDataAgeHours)}
            {@const icon = iconOf(item)}
            {@const displayName = displayNameOf(item)}

            {#if state === 'bought'}
              <!-- Bought state -->
              <div
                class="flex items-center px-5 py-2.5 pl-11 gap-3 border-l-3 border-transparent opacity-45 cursor-pointer"
                data-testid="route-item"
                data-state="bought"
                role="button"
                tabindex="0"
                onclick={() => toggleState(item, 'bought')}
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleState(item, 'bought') } }}
              >
                <div class="w-5 h-5 rounded border-2 border-primary bg-primary/30 flex items-center justify-center shrink-0">
                  <span class="text-primary text-xs">✓</span>
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm line-through text-base-content/50">{displayName}</span>
                </div>
                <span class="text-sm text-base-content/30 tabular-nums">×{item.recommendedUnits}</span>
                <span class="text-sm text-base-content/30 tabular-nums">{fmt(item.buyPrice)}</span>
              </div>

            {:else if dismissed}
              <!-- Dismissed (linked partner bought elsewhere) -->
              <div
                class="flex items-center px-5 py-2.5 pl-11 gap-3 border-l-3 border-transparent opacity-30 cursor-not-allowed"
                data-testid="route-item"
                data-state="dismissed"
              >
                <div class="w-5 h-5 rounded border-2 border-base-content/15 bg-base-content/5 flex items-center justify-center shrink-0">
                  <span class="text-base-content/30 text-xs">—</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm line-through text-base-content/40">{displayName}</span>
                    {#if item.isAlt}
                      <span class="badge badge-xs badge-warning opacity-50">alt</span>
                    {/if}
                  </div>
                  <p class="text-xs text-base-content/25 pl-0 mt-0.5">
                    Bought on {item.isAlt ? item.primaryWorld : findLinked(item)?.world}
                  </p>
                </div>
                <span class="text-sm text-base-content/20 tabular-nums">{fmt(item.buyPrice)}</span>
              </div>

            {:else if state === 'missing'}
              <!-- Missing state -->
              <div
                class="flex items-center px-5 py-2.5 pl-11 gap-3 border-l-3 border-transparent opacity-45"
                data-testid="route-item"
                data-state="missing"
              >
                <div class="w-5 h-5 rounded border-2 border-error bg-error/20 flex items-center justify-center shrink-0">
                  <span class="text-error text-xs">✕</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm line-through text-base-content/50">{displayName}</span>
                    <span class="badge badge-xs badge-error">missing</span>
                  </div>
                </div>
                <span class="text-sm text-base-content/30 tabular-nums">{fmt(item.buyPrice)}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-error/60"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); toggleState(item, 'missing') }}
                  aria-label="Undo missing"
                >✕</button>
              </div>

            {:else}
              <!-- Unchecked (default) state -->
              <div
                class="flex items-center px-5 py-2.5 pl-11 gap-3 border-l-3 cursor-pointer hover:bg-base-200/50 {promoted ? 'border-warning' : 'border-transparent'} {item.isAlt && !promoted ? 'opacity-75' : ''}"
                data-testid="route-item"
                data-state="unchecked"
                role="button"
                tabindex="0"
                onclick={() => toggleState(item, 'bought')}
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleState(item, 'bought') } }}
              >
                <div class="w-5 h-5 rounded border-2 border-base-content/20 shrink-0"></div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    {#if icon}
                      <img src={icon} alt="" width="20" height="20" class="shrink-0"
                        onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    {/if}
                    <span class="text-sm">{displayName}</span>
                    {#if item.isAlt}
                      <span class="badge badge-xs badge-warning">alt</span>
                    {/if}
                    <CopyButton text={displayName} />
                  </div>
                  {#if item.isAlt && item.primaryWorld && item.primaryBuyPrice}
                    <p class="text-xs mt-0.5 pl-7 {promoted ? 'text-warning' : 'text-base-content/35'}">
                      {#if promoted}
                        ⚠ Missing on {item.primaryWorld} — available here at {fmt(item.buyPrice)} ({priceDiffPercent(item.buyPrice, item.primaryBuyPrice)})
                      {:else}
                        Primary: {item.primaryWorld} at {fmt(item.primaryBuyPrice)} · here: {fmt(item.buyPrice)} ({priceDiffPercent(item.buyPrice, item.primaryBuyPrice)})
                      {/if}
                    </p>
                  {/if}
                </div>
                <span class="text-sm text-base-content/50 tabular-nums">×{item.recommendedUnits}</span>
                <span class="text-sm tabular-nums {item.isAlt ? 'text-base-content/50' : 'text-success'}">{fmt(item.buyPrice)}</span>
                <span class="badge badge-xs {conf.color}">{conf.text}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-error/40 hover:text-error/80"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); toggleState(item, 'missing') }}
                  aria-label="Mark as missing"
                >✕</button>
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>
