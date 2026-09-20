import { createContext, useContext } from 'react'
import type { Me } from '../../api/types'

export type Session = { me: Me; signOut: () => Promise<void> }

export const SessionContext = createContext<Session | null>(null)

// Everything under SessionGate is signed in, so `me` is always there: no screen has to handle "no user".
export function useSession() {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error('useSession needs a SessionGate above it')
  }
  return session
}
