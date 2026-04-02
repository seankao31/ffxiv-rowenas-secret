import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
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
