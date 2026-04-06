import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { version } from './package.json'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${version}`),
  },
  test: {
    include: ['tests/client/**/*.test.ts', 'tests/server/**/*.test.ts'],
  },
})
