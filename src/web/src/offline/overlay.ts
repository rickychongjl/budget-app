import type { CategoryRollup, CycleSummary, Transaction } from '../api/types'
import type { OutboxRow } from './db'

// What the screen shows is overlay(server snapshot, outbox): the last answer from the server with the changes it has not
// seen yet laid over it. Pure functions, no storage and no React.
//
// This is the one place the front end does rollup maths (plan decision 2, and the one exception to MASTER 3.3's "the
// front end does not recompute it"). It repeats CycleRollup.Line in Budget.Domain, only for rows the server has not
// counted, and with an empty outbox it returns the snapshot untouched. Once a drain succeeds and a fresh snapshot
// arrives, the server's own numbers replace these.

// A row the server has accepted keeps counting until the snapshot is newer than the sync. Dropping it at the moment of
// the sync would make a saved transaction vanish until the refetch landed; keeping it past that would count it twice.
const live = (rows: OutboxRow[], snapshotAt: number) => rows.filter((row) => row.syncedAt === undefined || row.syncedAt > snapshotAt)

// Amounts are decimal(18,2) on the server. Summing them as floats drifts (380 + 0.1 + 0.2), so every result is put back
// on whole cents.
const cents = (amount: number) => Math.round(amount * 100) / 100

// CycleRollup.Line: the same four lines, in the same order.
function judge(row: CategoryRollup): CategoryRollup {
  const actual = cents(row.actual)
  return {
    ...row,
    actual,
    remaining: cents(row.budgeted - actual),
    // The server divides decimals; floats give 102.49999999999999 for 410 of 400, so it is put back on four places.
    percentUsed: row.budgeted === 0 ? null : Math.round((actual / row.budgeted) * 1e6) / 1e4,
    status: actual <= row.budgeted ? 'OnTrack' : row.type === 'Debit' ? 'Over' : 'Ahead',
  }
}

export function overlaySummary(summary: CycleSummary, outbox: OutboxRow[], snapshotAt: number): CycleSummary {
  const cycleId = summary.cycle.id
  const rows = live(outbox, snapshotAt).filter(({ item, before }) =>
    item.type === 'transaction.create' ? item.create.cycleId === cycleId : item.type === 'category.edit' ? item.cycleId === cycleId : before?.cycleId === cycleId,
  )
  if (rows.length === 0) {
    return summary
  }

  const categories = new Map(summary.rollup.categories.map((row) => [row.categoryId, { ...row }]))
  const spend = (categoryId: string, amount: number) => {
    const row = categories.get(categoryId)
    if (row) {
      row.actual += amount
    }
  }

  for (const { item, before } of rows) {
    if (item.type === 'transaction.create') {
      spend(item.create.categoryId, item.create.amount)
    } else if (item.type === 'category.edit') {
      const row = categories.get(item.categoryId)
      if (row) {
        const { budgetAmount, name, icon, colour } = item.category
        Object.assign(row, { name: name ?? row.name, icon: icon ?? row.icon, colour: colour ?? row.colour, budgeted: budgetAmount ?? row.budgeted })
      }
    } else if (before) {
      // Take the transaction out as it was, and for an edit put it back as it now is.
      spend(before.categoryId, -before.amount)
      if (item.type === 'transaction.edit') {
        spend(item.edit.categoryId ?? before.categoryId, item.edit.amount ?? before.amount)
      }
    }
  }

  const lines = summary.rollup.categories.map((row) => judge(categories.get(row.categoryId)!))
  const total = (type: CategoryRollup['type'], pick: (row: CategoryRollup) => number) => cents(lines.filter((row) => row.type === type).reduce((sum, row) => sum + pick(row), 0))
  const debitsActual = total('Debit', (row) => row.actual)
  const creditsActual = total('Credit', (row) => row.actual)

  return {
    cycle: summary.cycle,
    rollup: {
      ...summary.rollup,
      categories: lines,
      debitsBudgeted: total('Debit', (row) => row.budgeted),
      debitsActual,
      creditsBudgeted: total('Credit', (row) => row.budgeted),
      creditsActual,
      net: cents(creditsActual - debitsActual),
    },
  }
}

export function overlayTransactions(transactions: Transaction[], cycleId: string, outbox: OutboxRow[], snapshotAt: number): Transaction[] {
  const rows = live(outbox, snapshotAt).filter(({ item, before }) => (item.type === 'transaction.create' ? item.create.cycleId === cycleId : before?.cycleId === cycleId))

  const byClientId = new Map(transactions.map((transaction) => [transaction.clientId, transaction]))
  // Stands in for createdAt on a row the server has not stamped yet, so the latest entry of a day sorts first.
  const queuedAt = new Map<string, number>()

  for (const { item, seq = 0 } of rows) {
    if (item.type === 'transaction.create') {
      // A refetch can beat the sync's bookkeeping; the server's copy wins and the row is not listed twice.
      if (!byClientId.has(item.create.clientId)) {
        // The id is a placeholder until the server assigns one; rows are keyed and addressed by clientId throughout.
        byClientId.set(item.create.clientId, { ...item.create, id: item.create.clientId, createdAt: '', updatedAt: '' })
        queuedAt.set(item.create.clientId, seq)
      }
    } else if (item.type === 'transaction.edit') {
      const current = byClientId.get(item.clientId)
      if (current) {
        byClientId.set(item.clientId, { ...current, ...item.edit })
      }
    } else if (item.type === 'transaction.delete') {
      byClientId.delete(item.clientId)
    }
  }

  const queued = (transaction: Transaction) => queuedAt.get(transaction.clientId) ?? -1
  return [...byClientId.values()].sort(
    (a, b) => b.occurredOn.localeCompare(a.occurredOn) || queued(b) - queued(a) || b.createdAt.localeCompare(a.createdAt),
  )
}
