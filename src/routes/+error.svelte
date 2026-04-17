<script lang="ts">
  import { page } from '$app/state'
  import { Home } from 'lucide-svelte'
</script>

<div class="flex-1 flex items-center justify-center py-12 px-4">
  <div class="card bg-base-200 max-w-md w-full">
    <div class="card-body items-center text-center">
      <h1 class="text-6xl font-bold text-base-content/30">{page.status}</h1>
      <p class="text-lg mt-2">{page.error?.message ?? 'Something went wrong'}</p>
      <a href="/" class="btn btn-primary mt-6">
        <Home class="w-4 h-4" />
        Back to dashboard
      </a>
    </div>
  </div>
</div>
