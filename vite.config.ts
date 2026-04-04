import { execSync } from 'node:child_process'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

const appVersion = execSync('git describe --tags --abbrev=0').toString().trim()

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
