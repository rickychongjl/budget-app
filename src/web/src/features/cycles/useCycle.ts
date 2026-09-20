import { useMemo } from 'react'
import { api } from '../../api/client'
import type { CycleSummary } from '../../api/types'
import { overlaySummary } from '../../offline/overlay'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { useOutbox } from '../../offline/useOutbox'

// Any cycle by id, past ones included: the cached server answer with the outbox laid over it, like useCurrentCycle.
export function useCycle(cycleId: string) {
  const snapshot = useCachedQuery<CycleSummary>(['cycles', cycleId], () => api.get<CycleSummary>(`/api/cycles/${cycleId}`))
  const outbox = useOutbox()
  const data = useMemo(() => (snapshot.data ? overlaySummary(snapshot.data, outbox, snapshot.at) : undefined), [snapshot.data, snapshot.at, outbox])

  return { ...snapshot, data }
}
