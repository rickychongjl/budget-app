// The service worker keeps the last good GET /api/me so the app can open with no signal (vite.config.ts). It is the
// one thing the worker caches about a person, and it goes when they sign out, so the next person on this device is
// not opened as them. `caches` is missing in an insecure context and in jsdom, and then there is nothing to clear.
export async function clearSessionCache() {
  if ('caches' in window) {
    await caches.delete('session')
  }
}
