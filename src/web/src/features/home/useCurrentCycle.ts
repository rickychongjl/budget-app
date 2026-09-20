import { useMemo } from 'react'
import { api, ProblemError } from '../../api/client'
import type { CycleSummary } from '../../api/types'
import { overlaySummary } from '../../offline/overlay'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { useOutbox } from '../../offline/useOutbox'

export const CURRENT_CYCLE = ['cycles', 'current']

// The one hook Home reads: the last answer from the server (from IndexedDB until the network replies) with the changes
// still in the outbox laid over it. `data` is null when there is no cycle to show yet, which is a normal state for a
// new user and not an error.
export function useCurrentCycle() {
  const snapshot = useCachedQuery<CycleSummary | null>(CURRENT_CYCLE, () =>
    api.get<CycleSummary>('/api/cycles/current').catch((error: unknown) => {
      if (error instanceof ProblemError && error.code === 'cycle.none') {
        return null
      }
      throw error
    }),
  )
  const outbox = useOutbox()
  const data = useMemo(() => (snapshot.data ? overlaySummary(snapshot.data, outbox, snapshot.at) : snapshot.data), [snapshot.data, snapshot.at, outbox])

  return { ...snapshot, data }
}
