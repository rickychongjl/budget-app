import { useQuery, useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { api, NetworkError, onUnauthorized, ProblemError, resetCsrf } from '../../api/client'
import type { Me } from '../../api/types'
import { db } from '../../offline/db'
import { clearSessionCache } from '../../pwa/sessionCache'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { Landing } from '../public/Landing'
import styles from './SignIn.module.css'
import { SignIn } from './SignIn'
import { SessionContext, type SignOutOptions } from './useSession'

const ME = ['me']

// The session cookie is HttpOnly, so the page cannot look at it. Whether someone is signed in is simply whether
// GET /api/me answers: a 401 is "nobody", which is a normal state here and not an error.
export function SessionGate({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const { pathname } = useLocation()
  const me = useQuery({
    queryKey: ME,
    queryFn: () =>
      api.get<Me>('/api/me').catch((error: unknown) => {
        if (error instanceof ProblemError && error.status === 401) {
          return null
        }
        throw error
      }),
    staleTime: Infinity,
  })

  // Nothing of this user's is left on screen or on disk for the next person on this device: cached answers in IndexedDB,
  // the service worker's copy of /api/me, and the queries in memory. The outbox is kept: it is theirs if they sign back
  // in, and configureOutbox discards it if someone else does. The anti-forgery token belonged to the old session.
  const forget = useCallback(async () => {
    resetCsrf()
    client.setQueryData(ME, null)
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== ME[0] })
    await Promise.all([db.cache.clear(), clearSessionCache()])
  }, [client])

  // A 401 from any request means the session has gone (expired, or signed out in another tab). It is forgotten the way
  // sign-out forgets it, so an expired session does not leave the last person's budget readable on the device, and the
  // worker's cached /api/me cannot reopen the app offline for a session the server has ended.
  useEffect(() => {
    onUnauthorized(() => void forget())
    return () => onUnauthorized(() => undefined)
  }, [forget])

  // Either way the anti-forgery token was issued to whoever the caller was before, so it is dropped.
  const signedIn = useCallback(async () => {
    resetCsrf()
    await client.invalidateQueries({ queryKey: ME })
  }, [client])

  // A deleted account never signs back in, so then the outbox goes too.
  const signOut = useCallback(
    async ({ accountDeleted = false }: SignOutOptions = {}) => {
      if (!accountDeleted) {
        await api.post('/auth/logout')
      }
      await Promise.all([forget(), accountDeleted && db.outbox.clear()])
    },
    [forget],
  )

  const session = useMemo(() => (me.data ? { me: me.data, signOut } : null), [me.data, signOut])

  if (me.isPending) {
    return (
      <main className={styles.screen} aria-busy="true">
        <span className="visually-hidden">Loading</span>
        <Skeleton height="2.5rem" width="50%" />
        <Skeleton height="3rem" />
      </main>
    )
  }

  // Signed out, "/" is the landing page (decision D4) and every other path is the sign-in screen, as before. With no
  // connection at all a visitor to "/" still gets the landing page, which says that signing in needs one.
  const signedOut = pathname === '/' ? <Landing onSignedIn={signedIn} /> : <SignIn onSignedIn={signedIn} />

  if (me.isError) {
    if (pathname === '/' && me.error instanceof NetworkError) {
      return signedOut
    }

    return (
      <main className={styles.screen}>
        <EmptyState icon={WifiOff} action={<Button onClick={() => me.refetch()}>Try again</Button>}>
          Can't reach the server.
        </EmptyState>
      </main>
    )
  }

  return session ? <SessionContext value={session}>{children}</SessionContext> : signedOut
}
