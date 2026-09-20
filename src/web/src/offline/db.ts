import Dexie, { type Table } from 'dexie'
import type { SyncItem } from '../api/types'

// The last good answer to a read, kept whole, so the screen renders before the network answers and at all when it never
// does. `at` is when the server gave it (the query's dataUpdatedAt).
export type CacheRow = { key: string; userId: string; json: unknown; at: number }

// What an edited or deleted transaction looked like on screen when the change was queued. Local only, never sent: it is
// what lets the overlay adjust a category's total without having the whole transaction list to hand.
export type Before = { cycleId: string; categoryId: string; amount: number }

export type OutboxRow = {
  // Insertion order, which is the order the server must apply them in.
  seq?: number
  userId: string
  // Exactly what POST /api/sync takes.
  item: SyncItem
  before?: Before
  // Set once the server has accepted it. The row stays, still counted by the overlay, until a snapshot newer than this
  // arrives; only then do the server's numbers include it.
  syncedAt?: number
}

class BudgetDb extends Dexie {
  cache!: Table<CacheRow, string>
  outbox!: Table<OutboxRow, number>

  constructor() {
    super('budget')
    this.version(1).stores({ cache: 'key, userId', outbox: '++seq, userId' })
  }
}

export const db = new BudgetDb()
