<script lang="ts">
  import { fetchItemMetadata, getIconUrl, getEnglishName, setOnChange } from '$lib/client/xivapi.ts'

  let { data } = $props()

  let nameGeneration = $state(0)
  setOnChange(() => nameGeneration++)

  $effect(() => {
    fetchItemMetadata([data.itemID])
  })

  const iconUrl = $derived.by(() => { void nameGeneration; return getIconUrl(data.itemID) })
  const enName = $derived.by(() => { void nameGeneration; return getEnglishName(data.itemID) ?? null })
  const primaryName = $derived(data.twName ?? enName ?? `Item #${data.itemID}`)
  const secondaryName = $derived(data.twName ? enName : null)
</script>

<!-- Item Header -->
<div class="flex items-center gap-3 py-4">
  {#if iconUrl}
    <img src={iconUrl} alt="" width="40" height="40" class="flex-shrink-0"
      onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
  {:else}
    <div class="skeleton h-10 w-10 flex-shrink-0"></div>
  {/if}

  <div class="flex items-baseline gap-2">
    <h1 class="text-lg font-bold">{primaryName}</h1>
    {#if secondaryName}
      <span class="text-sm text-base-content/50">{secondaryName}</span>
    {/if}
    <span class="badge badge-soft">{data.itemID}</span>
  </div>
</div>

<!-- Listings | History -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <div class="card bg-base-200">
    <div class="card-body">
      <h2 class="card-title">Cross-World Listings</h2>
      <div class="skeleton h-4 w-full"></div>
      <div class="skeleton h-4 w-3/4"></div>
      <div class="skeleton h-4 w-5/6"></div>
    </div>
  </div>

  <div class="card bg-base-200">
    <div class="card-body">
      <h2 class="card-title">Sale History</h2>
      <div class="skeleton h-4 w-full"></div>
      <div class="skeleton h-4 w-3/4"></div>
      <div class="skeleton h-4 w-5/6"></div>
    </div>
  </div>
</div>

<!-- Price Statistics -->
<div class="card bg-base-200 mt-4">
  <div class="card-body">
    <h2 class="card-title">Price Statistics</h2>
    <div class="skeleton h-4 w-full"></div>
    <div class="skeleton h-4 w-2/3"></div>
    <div class="skeleton h-4 w-3/4"></div>
  </div>
</div>
