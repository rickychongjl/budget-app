import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

// The service worker's registration module only exists inside a Vite build; here there is no worker to register.
// pwa.test.tsx replaces this with a mock it can drive.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => () => Promise.resolve() }))

// A request no test declared is a bug in the test, not something to let through to the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

// jsdom has no matchMedia. This one answers only the dark-scheme query, and a test flips it with setSystemDark.
let systemDark = false
const schemeListeners = new Set<(event: MediaQueryListEvent) => void>()

export function setSystemDark(dark: boolean) {
  systemDark = dark
  schemeListeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent))
}

window.matchMedia = (query: string) =>
  ({
    media: query,
    get matches() {
      return query.includes('dark') && systemDark
    },
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => schemeListeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => schemeListeners.delete(listener),
  }) as unknown as MediaQueryList

// jsdom has the <dialog> element but not its modal methods. These only track the open state, which is all a unit test can
// see anyway: the focus trap, Escape handling, focus return and ::backdrop are the browser's and are checked by hand on /kit.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  if (this.hasAttribute('open')) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
