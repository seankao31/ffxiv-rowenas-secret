import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist/client',
  },
  root: '.',
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
