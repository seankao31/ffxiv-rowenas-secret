<script lang="ts">
  import { Copy, Check } from 'lucide-svelte'
  import { onDestroy } from 'svelte'

  const { text }: { text: string } = $props()

  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => copied = false, 1500)
    } catch {
      // clipboard write failed — no feedback swap
    }
  }

  onDestroy(() => clearTimeout(timer))
</script>

<button type="button" class="btn btn-ghost btn-xs opacity-50 hover:opacity-90" aria-label="Copy item name" onclick={(e) => { e.stopPropagation(); copy() }}>
  {#if copied}
    <Check class="w-3.5 h-3.5" strokeWidth={2.5} data-lucide="check" />
  {:else}
    <Copy class="w-3.5 h-3.5" strokeWidth={2.5} data-lucide="copy" />
  {/if}
</button>
