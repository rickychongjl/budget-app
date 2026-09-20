import { api, NetworkError, ProblemError } from '../api/client'
import type { SyncItem, SyncItemResult } from '../api/types'
import { db, type Before, type OutboxRow } from './db'

// The offline write path (design section 7, plan "How data moves"). A change that must work offline is never sent to
// its own endpoint: it is appended here, the overlay shows it at once, and drain() posts the queue to /api/sync.
// Replaying is safe by design: a create dedupes on clientId, an edit is last-write-wins, a delete of something already
// gone counts as done.
// No React and no TanStack in here; the app hands in what it needs through configureOutbox.

export type OutboxEvent =
  // The server said no, and would say no again: a demo cap, a category deleted elsewhere. The item is gone from the queue.
  | { type: 'refused'; item: SyncItem; code: string; detail: string }
  // `result` is the body the item's own endpoint would have returned (e.g. TransactionResult).
  | { type: 'synced'; item: SyncItem; result: unknown }

type Config = {
  userId: string
  // Refetches what is on screen, and resolves once the fresh snapshots are in. Rows the server has accepted are only
  // deleted after this, so the overlay can hand over to the server's numbers without a gap.
  refresh: () => Promise<void>
  retryDelays?: number[]
}

// SyncValidator.MaxItems.
const BATCH = 500
const RETRY_DELAYS = [5_000, 15_000, 60_000]

let config: Config | null = null
let running: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined
let failures = 0
// Rows inside a POST that has not come back. Those may already exist on the server, so they cannot be quietly dropped.
const onTheWire = new Set<number>()
const listeners = new Set<(event: OutboxEvent) => void>()

export function onOutbox(listener: (event: OutboxEvent) => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

const emit = (event: OutboxEvent) => listeners.forEach((listener) => listener(event))

// Called once somebody is signed in. The same person gets their queue back (a 401 mid-sync loses nothing); a different
// person must never inherit one, so everything that is not theirs is discarded, cached reads included.
export async function configureOutbox(next: Config) {
  stopOutbox()
  config = next
  await db.outbox.where('userId').notEqual(next.userId).delete()
  await db.cache.where('userId').notEqual(next.userId).delete()
}

export function stopOutbox() {
  clearTimeout(retryTimer)
  retryTimer = undefined
  failures = 0
  config = null
}

export async function enqueue(item: SyncItem, before?: Before) {
  if (!config) {
    throw new Error('configureOutbox has not been called')
  }
  const { userId } = config

  // Undo before anything was sent: drop the create and whatever was queued on top of it, and send nothing. Not once
  // the create is on the wire or accepted: then it exists on the server and the delete has to follow it there.
  if (item.type === 'transaction.delete') {
    const queued = await db.outbox.where('userId').equals(userId).toArray()
    const mine = queued.filter((row) => clientIdOf(row.item) === item.clientId)
    const unsent = mine.every((row) => row.syncedAt === undefined && !onTheWire.has(row.seq!))
    if (unsent && mine.some((row) => row.item.type === 'transaction.create')) {
      await db.outbox.bulkDelete(mine.map((row) => row.seq!))
      return
    }
  }

  await db.outbox.add({ userId, item, before })
  // Not awaited: the caller's job ends when the change is safely stored.
  void drain()
}

const clientIdOf = (item: SyncItem) => (item.type === 'transaction.create' ? item.create.clientId : item.type === 'category.edit' ? undefined : item.clientId)

// Event-driven, never polled: after each enqueue, on `online`, on load and when the page becomes visible (OutboxSync).
// One at a time. A call that arrives mid-drain joins the one in flight, which re-reads the queue before it finishes.
export function drain(): Promise<void> {
  running ??= run().finally(() => {
    running = null
  })
  return running
}

async function run() {
  while (config) {
    const { userId, refresh } = config
    const rows = await db.outbox.where('userId').equals(userId).sortBy('seq')

    // Accepted earlier, but the refresh after it failed. Try that again before anything else.
    if (rows.some((row) => row.syncedAt !== undefined) && !(await settle(rows, refresh))) {
      return retryLater()
    }

    const pending = rows.filter((row) => row.syncedAt === undefined).slice(0, BATCH)
    if (pending.length === 0) {
      clearTimeout(retryTimer)
      failures = 0
      return
    }
    // navigator.onLine false is reliable (true is not), so there is no point asking. The `online` event drains.
    if (!navigator.onLine) {
      return
    }

    let results: SyncItemResult[]
    pending.forEach((row) => onTheWire.add(row.seq!))
    try {
      results = await api.post<SyncItemResult[]>('/api/sync', { items: pending.map((row) => row.item) })
    } catch (error) {
      onTheWire.clear()
      if (error instanceof ProblemError && error.status === 401) {
        // Keep everything. Signing in again calls configureOutbox and drains.
        return
      }
      if (error instanceof NetworkError || (error instanceof ProblemError && (error.status >= 500 || error.status === 429))) {
        return retryLater()
      }
      // The whole batch was refused (400, 413). It would be refused again, and keeping it would block the queue for good.
      const problem = error instanceof ProblemError ? error : new ProblemError(0, {})
      await db.outbox.bulkDelete(pending.map((row) => row.seq!))
      pending.forEach((row) => emit({ type: 'refused', item: row.item, code: problem.code, detail: problem.message }))
      continue
    }

    onTheWire.clear()
    const syncedAt = Date.now()
    const accepted: OutboxRow[] = []
    for (const [index, row] of pending.entries()) {
      const result = results.find((candidate) => candidate.index === index)
      if (result?.ok) {
        accepted.push({ ...row, syncedAt })
        emit({ type: 'synced', item: row.item, result: result.result })
      } else {
        await db.outbox.delete(row.seq!)
        emit({ type: 'refused', item: row.item, code: result?.code ?? 'sync.no-result', detail: result?.detail ?? 'The change could not be saved.' })
      }
    }
    await db.outbox.bulkPut(accepted)
    failures = 0

    if (!(await settle(accepted, refresh))) {
      return retryLater()
    }
  }
}

// Refresh the screen's snapshots, then delete the rows the server already has. In that order, so there is no moment
// where a saved change is in neither the overlay nor the server's numbers.
async function settle(rows: OutboxRow[], refresh: () => Promise<void>) {
  try {
    await refresh()
  } catch {
    return false
  }
  await db.outbox.bulkDelete(rows.filter((row) => row.syncedAt !== undefined).map((row) => row.seq!))
  return true
}

// Only exists while something is waiting, so an idle app never polls. 5s, 15s, then every 60s.
function retryLater() {
  const delays = config?.retryDelays ?? RETRY_DELAYS
  const delay = delays[Math.min(failures++, delays.length - 1)]
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => void drain(), delay)
}
