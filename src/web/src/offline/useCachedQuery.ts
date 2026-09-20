import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { useSession } from '../features/auth/useSession'
import { db } from './db'

// A read that also works offline. TanStack Query fetches as usual; each good answer is written whole to IndexedDB, and
// until the next one arrives (or if it never does) the stored one is what the screen gets. So cached data renders
// first, skeletons appear only on a true first load, and an error is only an error when there is nothing to show.
// `at` is when the server gave this answer, which the overlay needs to know which outbox rows it already includes.
export function useCachedQuery<T>(queryKey: string[], queryFn: () => Promise<T>) {
  const { me } = useSession()
  // Per user, so one person's budget is never drawn for another even before configureOutbox has cleaned up.
  const cacheKey = `${me.id}:${queryKey.join('/')}`
  const query = useQuery({ queryKey, queryFn })
  // undefined while IndexedDB is being read, null when there is no stored answer.
  const stored = useLiveQuery(() => db.cache.get(cacheKey).then((row) => row ?? null), [cacheKey])

  useEffect(() => {
    if (query.isSuccess) {
      void db.cache.put({ key: cacheKey, userId: me.id, json: query.data, at: query.dataUpdatedAt })
    }
  }, [cacheKey, me.id, query.isSuccess, query.data, query.dataUpdatedAt])

  const hasData = query.isSuccess || stored != null
  return {
    data: query.isSuccess ? query.data : stored != null ? (stored.json as T) : undefined,
    at: query.isSuccess ? query.dataUpdatedAt : (stored?.at ?? 0),
    isPending: !hasData && (query.isPending || stored === undefined),
    isError: !hasData && query.isError && stored === null,
    refetch: query.refetch,
  }
}
