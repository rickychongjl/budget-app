import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

// ponytail: navigator.onLine only knows whether there is a network interface, not whether the API is reachable (captive
// portal, server down). The drain treats a failed request as "keep and retry", so a wrong "online" costs nothing but a
// missing banner. Add a heartbeat if the banner is ever wrong for long.
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}
