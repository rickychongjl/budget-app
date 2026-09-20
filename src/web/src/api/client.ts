// The only place the app calls fetch. Same origin, cookie session (HttpOnly, so the page never sees it), and the
// anti-forgery token on every write (CLAUDE.md, "Every non-GET under /api and the /auth POSTs is antiforgery-checked").
// The offline drain (slice 7) posts /api/sync through here too, so it gets the same token handling.

// The server said no, in RFC 9457 problem details. `code` is stable and is what the UI switches on; `message` is the
// server's `detail`, written for a person; `errors` holds field messages for a validation failure.
export class ProblemError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: Record<string, string[]>

  constructor(status: number, problem: { code?: string; detail?: string; title?: string; errors?: Record<string, string[]> }) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`)
    this.name = 'ProblemError'
    this.status = status
    this.code = problem.code ?? `http.${status}`
    this.errors = problem.errors ?? {}
  }
}

// The request never got an answer. Not a refusal: queued work is kept and tried again.
export class NetworkError extends Error {
  constructor() {
    super('No connection')
    this.name = 'NetworkError'
  }
}

const CSRF_HEADER = 'X-XSRF-TOKEN'

// In memory only, never in storage. The token is bound to whoever is signed in when it is issued, so it is dropped
// (resetCsrf) after signing in or out, and refetched once if the server says it is stale.
let csrf: Promise<string> | null = null

export function resetCsrf() {
  csrf = null
}

function csrfToken() {
  csrf ??= send<{ token: string }>('GET', '/auth/csrf')
    .then((body) => body.token)
    .catch((error: unknown) => {
      // A failure is not remembered, or one dropped request would break every write until reload.
      csrf = null
      throw error
    })
  return csrf
}

let unauthorized = () => {}

// The session gate registers here so that a 401 from anywhere drops the app back to sign-in.
export function onUnauthorized(handler: () => void) {
  unauthorized = handler
}

async function send<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET') {
    headers[CSRF_HEADER] = await csrfToken()
  }

  let response: Response
  try {
    response = await fetch(new URL(path, location.origin), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new NetworkError()
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T
  }

  const problem = await response.json().catch(() => ({}))
  if (response.status === 400 && problem.code === 'csrf.invalid' && !retried) {
    resetCsrf()
    return send<T>(method, path, body, true)
  }
  if (response.status === 401) {
    unauthorized()
  }
  throw new ProblemError(response.status, problem)
}

export const api = {
  get: <T>(path: string) => send<T>('GET', path),
  post: <T = void>(path: string, body?: unknown) => send<T>('POST', path, body),
  patch: <T = void>(path: string, body?: unknown) => send<T>('PATCH', path, body),
  delete: <T = void>(path: string) => send<T>('DELETE', path),
}
