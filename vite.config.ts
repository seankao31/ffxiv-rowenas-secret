/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { version } from './package.json'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
      // Worktree symlinks node_modules to the main project. SvelteKit's client
      // entry resolves through the real path, which is outside the worktree root.
      allow: [resolve(__dirname, '../..')],
    },
    watch: {
      // Sibling worktrees under .worktrees/ contain their own tsconfig.json
      // files. Vite triggers a full SSR module reload on any tsconfig.json
      // change in the watched tree, re-running hooks.server.ts init() and
      // double-starting the Universalis scanner. Anchor to this project's
      // absolute .worktrees/ path so only sibling worktrees are ignored —
      // a relative glob would match the active worktree's own files when
      // running dev from within a worktree and break HMR entirely.
      ignored: [resolve(__dirname, '.worktrees') + '/**'],
    },
  },
  // Resolve browser exports only during test runs (Svelte's mount() requires
  // the browser build). Scoped via VITEST env var to avoid affecting SSR/dev.
  ...(process.env.VITEST ? { resolve: { conditions: ['browser'] } } : {}),
  test: {
    include: ['tests/client/**/*.test.ts', 'tests/server/**/*.test.ts'],
  },
})
