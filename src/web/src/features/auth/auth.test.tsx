import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { Me, SignInMethod } from '../../api/types'
import { server } from '../../test/server'
import { SessionGate } from './SessionGate'
import { useSession } from './useSession'

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

// A stand-in for the app behind the gate.
function Inside() {
  const { me, signOut } = useSession()
  return (
    <>
      <p>Hello {me.displayName}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </>
  )
}

// signedIn is mutable so a handler can flip it, the way the server's cookie would.
function backend({ signIn = ['demo'] as SignInMethod[], signedIn = false } = {}) {
  const state = { signedIn, demoTokens: [] as (string | null)[], csrfFetches: 0 }
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
      <SessionGate>
        <Inside />
      </SessionGate>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetCsrf()
  history.replaceState(null, '', '/')
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

  test('offers Microsoft only when this deployment has it', async () => {
    backend({ signIn: ['demo'] })
    renderGate()

    await screen.findByRole('button', { name: 'Try the demo' })
    expect(screen.queryByRole('link', { name: 'Sign in with Microsoft' })).not.toBeInTheDocument()
  })

  test('Microsoft sign-in is a plain link to the server, which does the OpenID Connect round trip', async () => {
    backend({ signIn: ['demo', 'entra'] })
    renderGate()

    expect(await screen.findByRole('link', { name: 'Sign in with Microsoft' })).toHaveAttribute('href', '/auth/login')
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

describe('a refused Microsoft sign-in lands on /signin?error=', () => {
  test.each([
    ['auth.not-allowed', "This account isn't allowed to use this app."],
    ['auth.failed', "The sign-in didn't complete. Please try again."],
    ['something.new', "The sign-in didn't complete. Please try again."],
  ])('%s', async (code, message) => {
    history.replaceState(null, '', `/signin?error=${code}`)
    backend({ signIn: ['demo', 'entra'] })
    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    // The way forward is still there.
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
