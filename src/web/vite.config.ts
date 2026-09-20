/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API (docker compose, or dotnet run on the same port) owns these; everything else is the SPA.
// API_TARGET points the proxy somewhere else, e.g. a second stack on another port.
const api = { target: process.env.API_TARGET ?? 'http://localhost:8080', changeOrigin: false }

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api, '/auth': api } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
    // Off by default, which also blanks `?raw` stylesheet imports; tokens.test.ts reads them as text.
    css: true,
    // One worker per core is one jsdom per core, and the chart test loads Recharts into its own. On a sixteen-core
    // machine that ran the heap out of memory and took whole files down with it. Four is plenty for seventeen files.
    maxWorkers: 4,
  },
})
