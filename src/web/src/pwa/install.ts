import { useSyncExternalStore } from 'react'

// Chromium fires this before it would show its own install banner; holding on to it lets the app offer the install
// where it makes sense instead. Not in lib.dom, because only Chromium has it.
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The hint is a per-device convenience, like the theme, so it lives in localStorage and never reaches the server.
const KEY = 'budget.install-hint'

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

// At module load, not in a hook: the event can fire before React has mounted anything.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferred = event as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Already opened from the home screen: Chromium and Android report it through the media query, iOS through its own flag.
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

// ponytail: iPadOS 13+ says it is a Mac, so an iPad gets no hint. Sniff the touch points if that matters.
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

function dismissed() {
  try {
    return localStorage.getItem(KEY) === 'dismissed'
  } catch {
    return false
  }
}

// 'prompt': the browser can install on a tap. 'ios': Safari has no prompt, so the hint says where "Add to Home Screen"
// is. null: installed, dismissed, or a browser that can do neither.
export type InstallOffer = 'prompt' | 'ios' | null

function snapshot(): InstallOffer {
  if (isStandalone() || dismissed()) {
    return null
  }
  return deferred ? 'prompt' : isIos() ? 'ios' : null
}

export function useInstallOffer() {
  const offer = useSyncExternalStore(subscribe, snapshot)

  return {
    offer,
    install: async () => {
      if (!deferred) {
        return
      }
      const event = deferred
      await event.prompt()
      if ((await event.userChoice).outcome === 'accepted') {
        deferred = null
        notify()
      }
    },
    // Design section 7: the hint is shown once. Dismissing is what ends it, so a glance does not count as reading it.
    dismiss: () => {
      try {
        localStorage.setItem(KEY, 'dismissed')
      } catch {
        // Private mode, or storage blocked: the hint comes back next visit, which is the worst that happens.
      }
      notify()
    },
  }
}
