import { useLiveQuery } from 'dexie-react-hooks'
import { useSession } from '../features/auth/useSession'
import { db, type OutboxRow } from './db'

const NONE: OutboxRow[] = []

// The signed-in user's queue, in order, live: a component using this re-renders when a change is queued or drained.
export function useOutbox(): OutboxRow[] {
  const { me } = useSession()
  return useLiveQuery(() => db.outbox.where('userId').equals(me.id).sortBy('seq'), [me.id]) ?? NONE
}

// For the banner: changes the server has not accepted yet.
export const countWaiting = (outbox: OutboxRow[]) => outbox.filter((row) => row.syncedAt === undefined).length
