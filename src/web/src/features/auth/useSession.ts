import { createContext, useContext } from 'react'
import type { Me } from '../../api/types'

export type SignOutOptions = {
  // The server has already ended the session because the account was deleted: nothing is posted to /auth/logout, and
  // queued changes are dropped as well, since there is no account left for them to land in.
  accountDeleted?: boolean
}

export type Session = { me: Me; signOut: (options?: SignOutOptions) => Promise<void> }

export const SessionContext = createContext<Session | null>(null)

// Everything under SessionGate is signed in, so `me` is always there: no screen has to handle "no user".
export function useSession() {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error('useSession needs a SessionGate above it')
  }
  return session
}
