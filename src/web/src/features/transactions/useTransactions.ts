import { useMemo } from 'react'
import { api } from '../../api/client'
import type { Transaction } from '../../api/types'
import { overlayTransactions } from '../../offline/overlay'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { useOutbox } from '../../offline/useOutbox'

// A cycle's transactions, newest first, queued ones included. The whole cycle is fetched and a category is picked out
// by the caller: that way an edit that moves a transaction to another category leaves one list and joins the other
// without either list needing its own request.
export function useTransactions(cycleId: string) {
  const snapshot = useCachedQuery<Transaction[]>(['transactions', cycleId], () => api.get<Transaction[]>(`/api/transactions?cycleId=${cycleId}`))
  const outbox = useOutbox()
  const data = useMemo(() => (snapshot.data ? overlayTransactions(snapshot.data, cycleId, outbox, snapshot.at) : undefined), [snapshot.data, snapshot.at, cycleId, outbox])

  return { ...snapshot, data }
}
