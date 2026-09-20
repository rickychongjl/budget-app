import { useQuery, useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { api, onUnauthorized, ProblemError, resetCsrf } from '../../api/client'
import type { Me } from '../../api/types'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import styles from './SignIn.module.css'
import { SignIn } from './SignIn'
import { SessionContext } from './useSession'

const ME = ['me']

// The session cookie is HttpOnly, so the page cannot look at it. Whether someone is signed in is simply whether
// GET /api/me answers: a 401 is "nobody", which is a normal state here and not an error.
export function SessionGate({ children }: { children: ReactNode }) {
  const client = useQueryClient()
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

  // A 401 from any request means the session has gone (expired, or signed out in another tab).
  useEffect(() => {
    onUnauthorized(() => client.setQueryData(ME, null))
    return () => onUnauthorized(() => undefined)
  }, [client])

  // Either way the anti-forgery token was issued to whoever the caller was before, so it is dropped.
  const signedIn = useCallback(async () => {
    resetCsrf()
    await client.invalidateQueries({ queryKey: ME })
  }, [client])

  const signOut = useCallback(async () => {
    await api.post('/auth/logout')
    resetCsrf()
    client.setQueryData(ME, null)
    // Nothing of this user's is left for the next person on this device.
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== ME[0] })
  }, [client])

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

  if (me.isError) {
    return (
      <main className={styles.screen}>
        <EmptyState icon={WifiOff} action={<Button onClick={() => me.refetch()}>Try again</Button>}>
          Can't reach the server.
        </EmptyState>
      </main>
    )
  }

  return session ? <SessionContext value={session}>{children}</SessionContext> : <SignIn onSignedIn={signedIn} />
}
