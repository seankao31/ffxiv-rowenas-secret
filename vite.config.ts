/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import path from 'node:path'
import { version } from './package.json'

// Vite lazy-loads SSR modules in dev, so SvelteKit's init() hook
// only fires on the first request. This plugin triggers that eagerly.
function devInitWarmup(): Plugin {
  return {
    name: 'dev-init-warmup',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer!.address()
        if (addr && typeof addr === 'object') {
          fetch(`http://localhost:${addr.port}/`).catch(() => {})
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), devInitWarmup(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${version}`),
  },
  server: {
    fs: {
      // When running in a git worktree, SvelteKit's client bundle is resolved
      // from the parent project's node_modules. Allow Vite to serve it.
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  // Resolve browser exports only during test runs (Svelte's mount() requires
  // the browser build). Scoped via VITEST env var to avoid affecting SSR/dev.
  ...(process.env.VITEST ? { resolve: { conditions: ['browser'] } } : {}),
  test: {
    include: ['tests/client/**/*.test.ts', 'tests/server/**/*.test.ts'],
  },
})
