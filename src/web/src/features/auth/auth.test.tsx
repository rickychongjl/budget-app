import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { Me, SignInMethod, SyncItem } from '../../api/types'
import { db } from '../../offline/db'
import { server } from '../../test/server'
import { BrowserRouter } from 'react-router'
import { SessionGate } from './SessionGate'
import { useSession } from './useSession'

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

// A stand-in for the app behind the gate.
function Inside() {
  const { me, signOut } = useSession()
  return (
    <>
      <p>Hello {me.displayName}</p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
      <button type="button" onClick={() => void signOut({ accountDeleted: true })}>
        Account deleted
      </button>
    </>
  )
}

// signedIn is mutable so a handler can flip it, the way the server's cookie would.
function backend({ signIn = ['demo'] as SignInMethod[], signedIn = false } = {}) {
  const state = { signedIn, demoTokens: [] as (string | null)[], csrfFetches: 0, logouts: 0 }
  server.use(
    http.get('/auth/options', () => HttpResponse.json({ signIn })),
    http.get('/auth/csrf', () => HttpResponse.json({ token: `token-${++state.csrfFetches}` })),
    http.get('/api/me', () => (state.signedIn ? HttpResponse.json(ME) : HttpResponse.json({ status: 401, code: 'http.401' }, { status: 401 }))),
    http.post('/auth/demo', ({ request }) => {
      state.demoTokens.push(request.headers.get('X-XSRF-TOKEN'))
      state.signedIn = true
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('/auth/logout', () => {
      state.logouts += 1
      state.signedIn = false
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <SessionGate>
          <Inside />
        </SessionGate>
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await db.cache.clear()
  await db.outbox.clear()
  resetCsrf()
  // The sign-in screen's own path; "/" signed out is the landing page (public.test.tsx).
  history.replaceState(null, '', '/signin')
})

describe('signed out', () => {
  test('shows the sign-in screen, not the app', async () => {
    backend()
    renderGate()

    expect(await screen.findByRole('button', { name: 'Try the demo' })).toBeInTheDocument()
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument()
  })

  test('shows the app mark with the name, and the mark adds nothing for a screen reader', async () => {
    backend()
    renderGate()

    const title = await screen.findByRole('heading', { level: 1, name: 'Tight Arse' })
    expect(title.parentElement!.querySelector('img[src="/favicon.svg"]')).toHaveAttribute('alt', '')
  })

  test('offers Google only when this deployment has it, and the demo is then the only action', async () => {
    backend({ signIn: ['demo'] })
    renderGate()

    await screen.findByRole('button', { name: 'Try the demo' })
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  test('Google sign-in is a plain link to the server, which does the OpenID Connect round trip', async () => {
    backend({ signIn: ['demo', 'google'] })
    renderGate()

    const google = await screen.findByRole('link', { name: 'Continue with Google' })
    expect(google).toHaveAttribute('href', '/auth/login')
    // Google's "G" is part of the button, and adds nothing for a screen reader beyond the words.
    expect(google.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  test('with Google offered it comes first, and the demo is still there under it', async () => {
    backend({ signIn: ['demo', 'google'] })
    renderGate()

    const google = await screen.findByRole('link', { name: 'Continue with Google' })
    const demo = screen.getByRole('button', { name: 'Try the demo' })
    expect(google.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('there is no Microsoft sign-in any more', async () => {
    backend({ signIn: ['demo', 'google'] })
    renderGate()

    await screen.findByRole('link', { name: 'Continue with Google' })
    expect(screen.queryByText(/Microsoft/)).not.toBeInTheDocument()
  })

  test('Try the demo signs in with an anti-forgery token, then drops it because it was issued to nobody', async () => {
    const state = backend()
    renderGate()

    await userEvent.click(await screen.findByRole('button', { name: 'Try the demo' }))

    expect(await screen.findByText('Hello Demo')).toBeInTheDocument()
    expect(state.demoTokens).toEqual(['token-1'])

    // The next write must fetch a token bound to the demo user.
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Try the demo' })
    expect(state.csrfFetches).toBe(2)
  })

  test('a demo sign-in that fails says so and leaves the button usable', async () => {
    backend()
    server.use(http.post('/auth/demo', () => HttpResponse.json({ status: 429, code: 'rate.limited', detail: 'Too many requests. Try again shortly.' }, { status: 429 })))
    renderGate()

    await userEvent.click(await screen.findByRole('button', { name: 'Try the demo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Try again shortly.')
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled()
  })
})

describe('a refused Google sign-in lands on /signin?error=', () => {
  test.each([
    ['auth.email-unverified', "Your Google account's email address isn't verified yet. Verify it with Google, then try again."],
    ['auth.failed', "The sign-in didn't complete. Please try again."],
    ['something.new', "The sign-in didn't complete. Please try again."],
  ])('%s', async (code, message) => {
    history.replaceState(null, '', `/signin?error=${code}`)
    backend({ signIn: ['demo', 'google'] })
    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    // The way forward is still there.
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument()
  })
})

describe('signed in', () => {
  test('goes straight to the app', async () => {
    backend({ signedIn: true })
    renderGate()

    expect(await screen.findByText('Hello Demo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument()
  })

  test('sign out returns to the sign-in screen', async () => {
    backend({ signedIn: true })
    renderGate()

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('button', { name: 'Try the demo' })).toBeInTheDocument()
  })

  // Both clear what this device holds about the person. Only sign-out keeps the outbox, for when they come back.
  async function seedDevice() {
    await db.cache.put({ key: 'cycles', userId: 'u1', json: [], at: 1 })
    await db.outbox.add({ userId: 'u1', item: { type: 'transaction.delete', clientId: 't1' } satisfies SyncItem })
  }

  test('sign out clears the cached reads and keeps the outbox', async () => {
    backend({ signedIn: true })
    await seedDevice()
    renderGate()

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('button', { name: 'Try the demo' })).toBeInTheDocument()
    await waitFor(async () => expect(await db.cache.count()).toBe(0))
    expect(await db.outbox.count()).toBe(1)
  })

  test('after the account is deleted it signs out locally only, and the outbox goes too', async () => {
    const state = backend({ signedIn: true })
    await seedDevice()
    renderGate()
    await screen.findByText('Hello Demo')

    // The server ended the session when it deleted the account.
    state.signedIn = false
    await userEvent.click(await screen.findByRole('button', { name: 'Account deleted' }))

    expect(await screen.findByRole('button', { name: 'Try the demo' })).toBeInTheDocument()
    await waitFor(async () => expect(await db.outbox.count()).toBe(0))
    expect(await db.cache.count()).toBe(0)
    expect(state.logouts).toBe(0)
  })

  test('a session that expires mid-use drops back to sign-in', async () => {
    const state = backend({ signedIn: true })
    renderGate()
    await screen.findByText('Hello Demo')

    // Any later request answering 401 is how the app finds out.
    state.signedIn = false
    const { api } = await import('../../api/client')
    await api.get('/api/me').catch(() => undefined)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument())
  })
})
