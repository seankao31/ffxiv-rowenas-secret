/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { version } from './package.json'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${version}`),
  },
  resolve: {
    // Required for mounting Svelte components in happy-dom unit tests
    conditions: ['browser'],
  },
  test: {
    include: ['tests/client/**/*.test.ts', 'tests/server/**/*.test.ts'],
  },
})
