import { useQuery } from '@tanstack/react-query'
import { api, ProblemError } from '../../api/client'
import type { CycleSummary } from '../../api/types'

export const CURRENT_CYCLE = ['cycles', 'current']

// The one hook Home reads. Today it is the query alone; M6 slice 7 puts the Dexie cache (so it renders before the
// network answers) and the outbox overlay (so an unsynced transaction already counts) behind it, and Home does not change.
// `data` is null when there is no cycle to show yet, which is a normal state for a new user and not an error.
export function useCurrentCycle() {
  return useQuery({
    queryKey: CURRENT_CYCLE,
    queryFn: () =>
      api.get<CycleSummary>('/api/cycles/current').catch((error: unknown) => {
        if (error instanceof ProblemError && error.code === 'cycle.none') {
          return null
        }
        throw error
      }),
  })
}
