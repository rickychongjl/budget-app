import { registerSW } from 'virtual:pwa-register'

// Registers the service worker and says when a newer build is waiting. The new worker takes over only when `apply` is
// called (registerType 'prompt' in vite.config.ts), because taking over reloads the page, and doing that unasked in
// the middle of entering a transaction would lose it.
export function watchForUpdates(onReady: (apply: () => Promise<void>) => void) {
  const update = registerSW({
    onNeedRefresh: () => onReady(() => update(true)),
  })
}
