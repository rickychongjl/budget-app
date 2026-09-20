import { useMemo } from 'react'
import { api } from '../../api/client'
import type { CycleSummary } from '../../api/types'
import { overlaySummary } from '../../offline/overlay'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { useOutbox } from '../../offline/useOutbox'

// Every cycle with its rollup, oldest first: one answer for the trend chart and the cycle list, so they cannot
// disagree. It is CycleSummary per cycle, which is what useCycle already gets for one, so the outbox lays over it
// the same way and queued changes count towards the cycle they were entered against.
//
// The key sits under 'cycles', so whatever invalidates the cycle queries after a drain refreshes this too.
export function useCycleReport() {
  const snapshot = useCachedQuery<CycleSummary[]>(['cycles', 'report'], () => api.get<CycleSummary[]>('/api/reports/cycles'))
  const outbox = useOutbox()
  const data = useMemo(
    () => snapshot.data?.map((summary) => overlaySummary(summary, outbox, snapshot.at)),
    [snapshot.data, snapshot.at, outbox],
  )

  return { ...snapshot, data }
}
