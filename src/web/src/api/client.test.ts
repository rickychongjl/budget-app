import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { server } from '../test/server'
import { api, NetworkError, onUnauthorized, ProblemError, resetCsrf } from './client'

const CSRF = 'X-XSRF-TOKEN'

// Counts token fetches and hands out token-1, token-2, ... so a test can tell a cached token from a fresh one.
function csrfEndpoint() {
  const state = { fetched: 0 }
  server.use(http.get('/auth/csrf', () => HttpResponse.json({ token: `token-${++state.fetched}` })))
  return state
}

beforeEach(() => {
  resetCsrf()
  onUnauthorized(() => undefined)
})

describe('reads', () => {
  test('a GET carries no anti-forgery token and does not fetch one', async () => {
    const csrf = csrfEndpoint()
    let header: string | null = 'unset'
    server.use(
      http.get('/api/me', ({ request }) => {
        header = request.headers.get(CSRF)
        return HttpResponse.json({ displayName: 'Ricky' })
      }),
    )

    expect(await api.get('/api/me')).toEqual({ displayName: 'Ricky' })
    expect(header).toBeNull()
    expect(csrf.fetched).toBe(0)
  })
})

describe('writes', () => {
  test('fetch the token once, keep it in memory and send it on every write', async () => {
    const csrf = csrfEndpoint()
    const seen: (string | null)[] = []
    server.use(
      http.post('/api/transactions', ({ request }) => {
        seen.push(request.headers.get(CSRF))
        return HttpResponse.json({ ok: true }, { status: 201 })
      }),
    )

    await api.post('/api/transactions', { amount: 5 })
    await api.post('/api/transactions', { amount: 6 })

    expect(seen).toEqual(['token-1', 'token-1'])
    expect(csrf.fetched).toBe(1)
  })

  test('send the body as JSON', async () => {
    csrfEndpoint()
    let body: unknown
    let contentType: string | null = null
    server.use(
      http.patch('/api/me', async ({ request }) => {
        contentType = request.headers.get('Content-Type')
        body = await request.json()
        return HttpResponse.json({})
      }),
    )

    await api.patch('/api/me', { displayName: 'Ricky' })

    expect(contentType).toBe('application/json')
    expect(body).toEqual({ displayName: 'Ricky' })
  })

  test('a 204 resolves to nothing', async () => {
    csrfEndpoint()
    server.use(http.post('/auth/logout', () => new HttpResponse(null, { status: 204 })))

    expect(await api.post('/auth/logout')).toBeUndefined()
  })

  // The token is bound to whoever was signed in when it was issued, so it goes stale on sign-in, sign-out and expiry.
  test('a stale token is refetched and the write retried once', async () => {
    const csrf = csrfEndpoint()
    const seen: (string | null)[] = []
    server.use(
      http.post('/api/transactions', ({ request }) => {
        seen.push(request.headers.get(CSRF))
        return seen.length === 1
          ? HttpResponse.json({ status: 400, code: 'csrf.invalid' }, { status: 400 })
          : HttpResponse.json({ ok: true }, { status: 201 })
      }),
    )

    expect(await api.post('/api/transactions', {})).toEqual({ ok: true })
    expect(seen).toEqual(['token-1', 'token-2'])
    expect(csrf.fetched).toBe(2)
  })

  test('only once: a second refusal is an error, not a loop', async () => {
    csrfEndpoint()
    let calls = 0
    server.use(
      http.post('/api/transactions', () => {
        calls++
        return HttpResponse.json({ status: 400, code: 'csrf.invalid' }, { status: 400 })
      }),
    )

    await expect(api.post('/api/transactions', {})).rejects.toMatchObject({ status: 400, code: 'csrf.invalid' })
    expect(calls).toBe(2)
  })

  test('resetCsrf forgets the token, for after signing in or out', async () => {
    const csrf = csrfEndpoint()
    server.use(http.post('/auth/demo', () => new HttpResponse(null, { status: 204 })))

    await api.post('/auth/demo')
    resetCsrf()
    await api.post('/auth/demo')

    expect(csrf.fetched).toBe(2)
  })
})

describe('failures', () => {
  test('problem details become a ProblemError with the code, detail and field errors', async () => {
    csrfEndpoint()
    server.use(
      http.post('/api/cycles', () =>
        HttpResponse.json(
          { status: 400, code: 'validation.failed', detail: 'One or more fields are not valid.', errors: { startDate: ['Required.'] } },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )

    const error = await api.post('/api/cycles', {}).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ProblemError)
    expect(error).toMatchObject({
      status: 400,
      code: 'validation.failed',
      message: 'One or more fields are not valid.',
      errors: { startDate: ['Required.'] },
    })
  })

  test('an error with no readable body still has its status and a code', async () => {
    server.use(http.get('/api/me', () => new HttpResponse('<html>bad gateway</html>', { status: 502 })))

    await expect(api.get('/api/me')).rejects.toMatchObject({ status: 502, code: 'http.502' })
  })

  test('no connection is a NetworkError, which is not the same thing as being refused', async () => {
    server.use(http.get('/api/me', () => HttpResponse.error()))

    await expect(api.get('/api/me')).rejects.toBeInstanceOf(NetworkError)
  })

  test('a token fetch that fails is not remembered', async () => {
    let attempts = 0
    server.use(
      http.get('/auth/csrf', () => (++attempts === 1 ? HttpResponse.error() : HttpResponse.json({ token: 'token-ok' }))),
      http.post('/auth/demo', () => new HttpResponse(null, { status: 204 })),
    )

    await expect(api.post('/auth/demo')).rejects.toBeInstanceOf(NetworkError)
    await expect(api.post('/auth/demo')).resolves.toBeUndefined()
  })

  test('a 401 tells the app the session has gone', async () => {
    const gone = vi.fn()
    onUnauthorized(gone)
    server.use(http.get('/api/cycles/current', () => HttpResponse.json({ status: 401, code: 'http.401' }, { status: 401 })))

    await expect(api.get('/api/cycles/current')).rejects.toMatchObject({ status: 401 })
    expect(gone).toHaveBeenCalledOnce()
  })
})
