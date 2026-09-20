/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API (docker compose, or dotnet run on the same port) owns these; everything else is the SPA.
const api = { target: 'http://localhost:8080', changeOrigin: false }

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api, '/auth': api } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
    // Off by default, which also blanks `?raw` stylesheet imports; tokens.test.ts reads them as text.
    css: true,
  },
})
