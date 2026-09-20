import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { SyncItem } from '../api/types'
import { useSession } from '../features/auth/useSession'
import { useToast } from '../ui/useToast'
import { configureOutbox, drain, onOutbox, stopOutbox } from './outbox'

const describe = (item: SyncItem) => (item.type === 'category.edit' ? 'a category change' : item.type === 'transaction.create' ? 'a transaction' : 'a transaction change')

// Renders nothing. Mounted once inside the session: it tells the outbox whose queue this is and how to refresh the
// screen, fires the drain triggers, and turns a refusal into an error toast (which stays until dismissed).
export function OutboxSync() {
  const { me } = useSession()
  const client = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    void configureOutbox({
      userId: me.id,
      // Rejects if any refetch fails, which keeps the accepted rows in the overlay until one succeeds.
      refresh: () => client.refetchQueries({ type: 'active' }, { throwOnError: true }),
    }).then(() => {
      if (!cancelled) {
        void drain()
      }
    })

    const onVisible = () => {
      // A phone app brought back from the background neither reloads nor reliably fires `online`.
      if (document.visibilityState === 'visible') {
        void drain()
      }
    }
    const onOnline = () => void drain()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const unsubscribe = onOutbox((event) => {
      if (event.type === 'refused') {
        toast.show({ message: `Couldn't save ${describe(event.item)}: ${event.detail}`, tone: 'error' })
      }
    })

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
      stopOutbox()
    }
  }, [me.id, client, toast])

  return null
}
