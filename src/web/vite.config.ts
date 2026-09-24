/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The API (docker compose, or dotnet run on the same port) owns these; everything else is the SPA.
// API_TARGET points the proxy somewhere else, e.g. a second stack on another port.
const api = { target: process.env.API_TARGET ?? 'http://localhost:8080', changeOrigin: false }

export default defineConfig({
  plugins: [
    react(),
    // Design section 7, "Service worker" and "Install". The worker precaches the built app shell so the app opens with
    // no signal, and is otherwise kept out of the way: the API is never a page (navigateFallbackDenylist) and, apart
    // from /api/me, is never cached here. Each answer is already kept whole in IndexedDB by useCachedQuery, per user
    // and stamped with when the server gave it, which the offline overlay relies on; a worker-served copy would carry
    // a fresh stamp for a stale answer and queued rows would be dropped as "already counted". /api/me is the exception
    // because SessionGate needs it before anything else can render: network first, so it is never stale while online,
    // and the cache only answers when the network cannot. SessionGate clears it on sign-out.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tight Arse',
        short_name: 'Tight Arse',
        description: 'A monthly budget tracker that works offline.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // The light --color-bg; theme.ts flips the meta tag at runtime, and the manifest only matters for the splash.
        theme_color: '#F8FAFC',
        background_color: '#F8FAFC',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          // The mark sits inside the inner 80%, so a masked (round, squircle) launcher never clips it.
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/health/],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname === '/api/me',
            handler: 'NetworkFirst',
            options: { cacheName: 'session', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
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
