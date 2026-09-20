import { describe, expect, test } from 'vitest'
import type { CategoryRollup, CycleSummary, Transaction } from '../api/types'
import type { OutboxRow } from './db'
import { overlaySummary, overlayTransactions } from './overlay'

const CYCLE = 'cycle-1'
const FOOD = 'cat-food'
const RENT = 'cat-rent'
const PAY = 'cat-pay'

function line(categoryId: string, type: 'Debit' | 'Credit', budgeted: number, actual: number): CategoryRollup {
  return {
    categoryId,
    name: categoryId,
    icon: 'tag',
    colour: 'blue',
    type,
    budgeted,
    actual,
    remaining: budgeted - actual,
    percentUsed: budgeted === 0 ? null : (actual / budgeted) * 100,
    status: actual <= budgeted ? 'OnTrack' : type === 'Debit' ? 'Over' : 'Ahead',
  }
}

const SUMMARY: CycleSummary = {
  cycle: { id: CYCLE, startDate: '2026-09-10', endDate: '2026-10-09', status: 'Confirmed', phase: 'Current', openingBalance: 1000, closingBalance: null },
  rollup: {
    categories: [line(FOOD, 'Debit', 400, 380), line(RENT, 'Debit', 2200, 0), line(PAY, 'Credit', 5000, 5000)],
    debitsBudgeted: 2600,
    debitsActual: 380,
    creditsBudgeted: 5000,
    creditsActual: 5000,
    net: 4620,
    accrued: null,
  },
}

let seq = 0
const create = (categoryId: string, amount: number, clientId = `tx-${++seq}`, cycleId = CYCLE): OutboxRow => ({
  seq: ++seq,
  userId: 'u1',
  item: { type: 'transaction.create', create: { clientId, cycleId, categoryId, amount, occurredOn: '2026-09-20', note: null } },
})
const edit = (clientId: string, before: { categoryId: string; amount: number }, change: { categoryId?: string; amount?: number; note?: string }): OutboxRow => ({
  seq: ++seq,
  userId: 'u1',
  item: { type: 'transaction.edit', clientId, edit: change },
  before: { cycleId: CYCLE, ...before },
})
const remove = (clientId: string, before: { categoryId: string; amount: number }): OutboxRow => ({
  seq: ++seq,
  userId: 'u1',
  item: { type: 'transaction.delete', clientId },
  before: { cycleId: CYCLE, ...before },
})

const food = (summary: CycleSummary) => summary.rollup.categories.find((row) => row.categoryId === FOOD)!

describe('overlaySummary', () => {
  test('an empty outbox returns the server snapshot untouched', () => {
    expect(overlaySummary(SUMMARY, [], 0)).toBe(SUMMARY)
  })

  test('a queued spend counts at once: the row, its status and the cycle totals', () => {
    const result = overlaySummary(SUMMARY, [create(FOOD, 30)], 0)

    // The same arithmetic as CycleRollup.Line.
    expect(food(result)).toMatchObject({ actual: 410, remaining: -10, percentUsed: 102.5, status: 'Over' })
    expect(result.rollup).toMatchObject({ debitsActual: 410, creditsActual: 5000, net: 4590 })
    // Nothing else moved, and the snapshot itself was not mutated.
    expect(result.rollup.categories[1]).toEqual(SUMMARY.rollup.categories[1])
    expect(food(SUMMARY).actual).toBe(380)
  })

  test('a queued income pushes a credit category ahead', () => {
    const result = overlaySummary(SUMMARY, [create(PAY, 250)], 0)

    expect(result.rollup.categories[2]).toMatchObject({ actual: 5250, remaining: -250, status: 'Ahead' })
    expect(result.rollup).toMatchObject({ creditsActual: 5250, net: 4870 })
  })

  test('spending exactly the limit is still on track', () => {
    expect(food(overlaySummary(SUMMARY, [create(FOOD, 20)], 0))).toMatchObject({ actual: 400, remaining: 0, status: 'OnTrack' })
  })

  test('money stays in whole cents', () => {
    // 380 + 0.1 + 0.2 is 380.30000000000007 in floating point.
    expect(food(overlaySummary(SUMMARY, [create(FOOD, 0.1), create(FOOD, 0.2)], 0)).actual).toBe(380.3)
  })

  test('a negative amount is a reversal', () => {
    expect(food(overlaySummary(SUMMARY, [create(FOOD, -80)], 0))).toMatchObject({ actual: 300, status: 'OnTrack' })
  })

  test('a transaction queued against another cycle does not touch this one', () => {
    expect(overlaySummary(SUMMARY, [create(FOOD, 30, 'tx-other', 'cycle-0')], 0).rollup.debitsActual).toBe(380)
  })

  test('an edit applies the difference, and can move the amount between categories', () => {
    const amount = overlaySummary(SUMMARY, [edit('tx-a', { categoryId: FOOD, amount: 50 }, { amount: 20 })], 0)
    expect(food(amount).actual).toBe(350)

    const moved = overlaySummary(SUMMARY, [edit('tx-a', { categoryId: FOOD, amount: 50 }, { categoryId: RENT })], 0)
    expect(food(moved).actual).toBe(330)
    expect(moved.rollup.categories[1].actual).toBe(50)
    expect(moved.rollup.debitsActual).toBe(380)
  })

  test('a note-only edit changes no numbers', () => {
    expect(overlaySummary(SUMMARY, [edit('tx-a', { categoryId: FOOD, amount: 50 }, { note: 'lunch' })], 0).rollup).toEqual(SUMMARY.rollup)
  })

  test('a delete takes the amount back out', () => {
    expect(food(overlaySummary(SUMMARY, [remove('tx-a', { categoryId: FOOD, amount: 50 })], 0)).actual).toBe(330)
  })

  test('create, edit, then delete of the same transaction nets to nothing', () => {
    const rows = [create(FOOD, 30, 'tx-a'), edit('tx-a', { categoryId: FOOD, amount: 30 }, { amount: 45 }), remove('tx-a', { categoryId: FOOD, amount: 45 })]

    expect(overlaySummary(SUMMARY, rows, 0).rollup).toEqual(SUMMARY.rollup)
  })

  test('a category edit changes the snapshot fields and re-judges the row against the new budget', () => {
    const row: OutboxRow = { seq: ++seq, userId: 'u1', item: { type: 'category.edit', cycleId: CYCLE, categoryId: FOOD, category: { name: 'Groceries', colour: 'pink', budgetAmount: 300 } } }

    const result = overlaySummary(SUMMARY, [row], 0)

    expect(food(result)).toMatchObject({ name: 'Groceries', colour: 'pink', icon: 'tag', budgeted: 300, remaining: -80, status: 'Over' })
    expect(result.rollup.debitsBudgeted).toBe(2500)
  })

  test('a budget of zero has no percentage', () => {
    const row: OutboxRow = { seq: ++seq, userId: 'u1', item: { type: 'category.edit', cycleId: CYCLE, categoryId: FOOD, category: { budgetAmount: 0 } } }

    expect(food(overlaySummary(SUMMARY, [row], 0))).toMatchObject({ budgeted: 0, percentUsed: null, status: 'Over' })
  })

  // The rollup arrives in sort order but without the numbers, so a reorder renumbers every row to its new position.
  test('queued sort orders reorder the rows; a row nobody renumbered keeps its place', () => {
    const order = (categoryId: string, sortOrder: number): OutboxRow => ({ seq: ++seq, userId: 'u1', item: { type: 'category.edit', cycleId: CYCLE, categoryId, category: { sortOrder } } })

    const moved = overlaySummary(SUMMARY, [order(FOOD, 1), order(RENT, 0), order(PAY, 2)], 0)
    expect(moved.rollup.categories.map((row) => row.categoryId)).toEqual([RENT, FOOD, PAY])

    // Renumbered twice: the later one wins.
    const again = overlaySummary(SUMMARY, [order(FOOD, 1), order(RENT, 0), order(PAY, 2), order(FOOD, 2), order(PAY, 1)], 0)
    expect(again.rollup.categories.map((row) => row.categoryId)).toEqual([RENT, PAY, FOOD])
  })

  // After a sync the rows stay until a fresh snapshot arrives, so a saved transaction never flickers out. Once the
  // snapshot is newer than the sync, the server's numbers already include them and counting them again would double up.
  test('a synced row still counts while the snapshot is older than the sync', () => {
    expect(food(overlaySummary(SUMMARY, [{ ...create(FOOD, 30), syncedAt: 2000 }], 1000)).actual).toBe(410)
  })

  test('a synced row stops counting once the snapshot is newer than the sync', () => {
    expect(overlaySummary(SUMMARY, [{ ...create(FOOD, 30), syncedAt: 2000 }], 2001)).toBe(SUMMARY)
  })
})

describe('overlayTransactions', () => {
  const server: Transaction[] = [
    { id: 's1', clientId: 'tx-s1', cycleId: CYCLE, categoryId: FOOD, amount: 50, occurredOn: '2026-09-18', note: null, createdAt: '2026-09-18T01:00:00Z', updatedAt: '2026-09-18T01:00:00Z' },
    { id: 's2', clientId: 'tx-s2', cycleId: CYCLE, categoryId: RENT, amount: 2200, occurredOn: '2026-09-10', note: 'September', createdAt: '2026-09-10T01:00:00Z', updatedAt: '2026-09-10T01:00:00Z' },
  ]

  test('a queued create appears in the list for its cycle', () => {
    const result = overlayTransactions(server, CYCLE, [create(FOOD, 30, 'tx-new')], 0)

    expect(result.map((t) => t.clientId)).toEqual(['tx-new', 'tx-s1', 'tx-s2'])
    expect(result[0]).toMatchObject({ amount: 30, categoryId: FOOD, occurredOn: '2026-09-20', note: null })
  })

  test('newest day first, and within a day the latest entry first', () => {
    const result = overlayTransactions(server, CYCLE, [create(FOOD, 1, 'tx-a'), create(FOOD, 2, 'tx-b')], 0)

    expect(result.map((t) => t.clientId)).toEqual(['tx-b', 'tx-a', 'tx-s1', 'tx-s2'])
  })

  test('an edit changes the row in place, whether it is on the server or still queued', () => {
    const rows = [create(FOOD, 30, 'tx-new'), edit('tx-new', { categoryId: FOOD, amount: 30 }, { amount: 35 }), edit('tx-s1', { categoryId: FOOD, amount: 50 }, { note: 'lunch' })]

    const result = overlayTransactions(server, CYCLE, rows, 0)

    expect(result.find((t) => t.clientId === 'tx-new')!.amount).toBe(35)
    expect(result.find((t) => t.clientId === 'tx-s1')).toMatchObject({ amount: 50, note: 'lunch' })
  })

  test('a delete removes the row', () => {
    expect(overlayTransactions(server, CYCLE, [remove('tx-s1', { categoryId: FOOD, amount: 50 })], 0).map((t) => t.clientId)).toEqual(['tx-s2'])
  })

  test('a create the server already returned is not listed twice', () => {
    const synced = { ...create(FOOD, 50, 'tx-s1'), syncedAt: 2000 }

    // Snapshot older than the sync, but it already has the row (a refetch raced the sync).
    expect(overlayTransactions(server, CYCLE, [synced], 1000)).toHaveLength(2)
  })

  test('another cycle is left alone', () => {
    expect(overlayTransactions(server, CYCLE, [create(FOOD, 30, 'tx-x', 'cycle-0')], 0)).toEqual(server)
  })

  test('the list is newest first even with nothing queued, whatever order the server used', () => {
    expect(overlayTransactions([...server].reverse(), CYCLE, [], 0).map((t) => t.clientId)).toEqual(['tx-s1', 'tx-s2'])
  })
})
