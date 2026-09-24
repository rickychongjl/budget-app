import { describe, expect, test } from 'vitest'
import type { CategoryRollup, Cycle, CycleSummary } from '../../api/types'
import { categoriesOf, niceTicks, summarise, toSeries, type TrendFilter } from './trend'

const line = (categoryId: string, name: string, actual: number, type: CategoryRollup['type'] = 'Debit', colour = 'blue'): CategoryRollup => ({
  categoryId, name, icon: 'tag', colour, type, budgeted: 700, actual, remaining: 700 - actual, percentUsed: (actual / 700) * 100, status: 'OnTrack', spreadEvenly: true,
})

const summary = (
  id: string,
  startDate: string,
  phase: Cycle['phase'],
  debitsActual: number,
  accrued: number | null,
  categories: CategoryRollup[] = [line('food', 'Groceries', debitsActual)],
  status: Cycle['status'] = 'Confirmed',
): CycleSummary => ({
  cycle: { id, startDate, endDate: startDate, status, phase, openingBalance: null, closingBalance: null },
  rollup: { categories, debitsBudgeted: 700, debitsActual, creditsBudgeted: 0, creditsActual: 0, net: -debitsActual, accrued },
})

const SPENDING: TrendFilter = { kind: 'spending' }
const ACCRUED: TrendFilter = { kind: 'accrued' }
const TODAY = '2026-09-20'

const REPORT = [
  summary('p1', '2026-06-13', 'Past', 500, 120),
  summary('p2', '2026-07-13', 'Past', 640, -50),
  summary('p3', '2026-08-12', 'Past', 460, 80),
  summary('cur', '2026-09-11', 'Current', 120, null),
  summary('fut', '2026-10-11', 'Future', 0, null),
]

describe('toSeries', () => {
  test('plots the cycles that have been lived in, oldest first, labelled by start date', () => {
    const series = toSeries(REPORT, SPENDING, TODAY)

    expect(series.map((point) => point.label)).toEqual(['13 Jun', '13 Jul', '12 Aug', '11 Sep'])
    expect(series.map((point) => point.value)).toEqual([500, 640, 460, 120])
  })

  test('an upcoming cycle is not a point: it would drag the line to zero', () => {
    expect(toSeries(REPORT, SPENDING, TODAY).map((point) => point.cycleId)).not.toContain('fut')
  })

  test('a draft is not a cycle yet', () => {
    const report = [...REPORT, summary('d', '2026-11-10', 'Current', 0, null, [], 'Draft')]

    expect(toSeries(report, SPENDING, TODAY).map((point) => point.cycleId)).not.toContain('d')
  })

  test('the current cycle is the last point and is marked partial, because it is still being spent', () => {
    const series = toSeries(REPORT, SPENDING, TODAY)

    expect(series.map((point) => point.partial)).toEqual([false, false, false, true])
  })

  test('accrued is a gap until the closing balance is entered, not a zero', () => {
    expect(toSeries(REPORT, ACCRUED, TODAY).map((point) => point.value)).toEqual([120, -50, 80, null])
  })

  test('one category follows that category, and is a gap in a cycle that did not have it', () => {
    const report = [
      summary('p1', '2026-06-13', 'Past', 500, null, [line('food', 'Groceries', 300), line('fuel', 'Fuel', 200)]),
      summary('p2', '2026-07-13', 'Past', 640, null, [line('food', 'Groceries', 640)]),
    ]

    expect(toSeries(report, { kind: 'category', categoryId: 'fuel' }, TODAY).map((point) => point.value)).toEqual([200, null])
  })

  test('an empty report has no points', () => {
    expect(toSeries([], SPENDING, TODAY)).toEqual([])
  })
})

describe('categoriesOf', () => {
  test('every category the report has seen, named by its newest cycle, spending before income', () => {
    const report = [
      summary('p1', '2026-06-13', 'Past', 500, null, [line('food', 'Food', 300), line('pay', 'Salary', 0, 'Credit', 'teal')]),
      summary('p2', '2026-07-13', 'Past', 640, null, [line('food', 'Groceries', 640, 'Debit', 'orange')]),
    ]

    expect(categoriesOf(report)).toEqual([
      { id: 'food', name: 'Groceries', colour: 'orange', type: 'Debit' },
      { id: 'pay', name: 'Salary', colour: 'teal', type: 'Credit' },
    ])
  })
})

describe('summarise', () => {
  const at = (values: number[], filter: TrendFilter = SPENDING) =>
    summarise(values.map((value, index) => ({ cycleId: `c${index}`, label: '', start: '', end: '', value, partial: false })), filter, 'AUD')

  test('compares the first finished cycle with the last', () => {
    expect(at([500, 400, 460])).toBe('Spending fell 8% over the last 3 finished cycles.')
    expect(at([400, 500])).toBe('Spending rose 25% over the last 2 finished cycles.')
  })

  test('says so plainly when nothing much changed', () => {
    expect(at([500, 500])).toBe('Spending held steady over the last 2 finished cycles.')
  })

  test('the cycle still being spent is left out, so a part-spent cycle is never a crash', () => {
    const series = [
      { cycleId: 'a', label: '', start: '', end: '', value: 500, partial: false },
      { cycleId: 'b', label: '', start: '', end: '', value: 400, partial: false },
      { cycleId: 'c', label: '', start: '', end: '', value: 12, partial: true },
    ]

    expect(summarise(series, SPENDING, 'AUD')).toBe('Spending fell 20% over the last 2 finished cycles, and is at $12.00 so far.')
  })

  // The demo's Transport: 100, 115, 100, 125 finished, then 62.40 three days into the current cycle. The sentence
  // said "rose 25%" under a line that visibly plunged, and read as a bug. It must account for the low last point.
  test('a rise is not claimed under a plunging line without explaining the plunge', () => {
    const series = [100, 115, 100, 125].map((value, index) => ({ cycleId: `c${index}`, label: '', start: '', end: '', value, partial: false }))
    series.push({ cycleId: 'now', label: '', start: '', end: '', value: 62.4, partial: true })

    expect(summarise(series, { kind: 'category', categoryId: 't', name: 'Transport' }, 'AUD'))
      .toBe('Transport rose 25% over the last 4 finished cycles, and is at $62.40 so far.')
  })

  test('with fewer than two finished cycles there is nothing to compare', () => {
    expect(at([500])).toBe('Not enough finished cycles to compare yet.')
    expect(at([])).toBe('Not enough finished cycles to compare yet.')
  })

  test('money accrued is compared in money, because a percentage across zero is nonsense', () => {
    expect(at([-50, 120], ACCRUED)).toBe('Money accrued rose $170.00 over the last 2 finished cycles.')
    expect(at([120, -50], ACCRUED)).toBe('Money accrued fell $170.00 over the last 2 finished cycles.')
  })

  test('a category is named', () => {
    const filter: TrendFilter = { kind: 'category', categoryId: 'food', name: 'Groceries' }

    expect(at([500, 250], filter)).toBe('Groceries fell 50% over the last 2 finished cycles.')
  })

  test('from nothing to something is money, not a division by zero', () => {
    expect(at([0, 250])).toBe('Spending rose $250.00 over the last 2 finished cycles.')
  })

  test('gaps are not compared', () => {
    const series = [
      { cycleId: 'a', label: '', start: '', end: '', value: null, partial: false },
      { cycleId: 'b', label: '', start: '', end: '', value: 400, partial: false },
      { cycleId: 'c', label: '', start: '', end: '', value: 300, partial: false },
    ]

    expect(summarise(series, SPENDING, 'AUD')).toBe('Spending fell 25% over the last 2 finished cycles.')
  })
})

describe('niceTicks', () => {
  test('at most four ticks (MASTER 10)', () => {
    for (const [min, max] of [[0, 640], [0, 7], [120, 3400], [-50, 120], [0, 1_250_000]] as const) {
      const ticks = niceTicks(min, max)
      expect(ticks.length).toBeLessThanOrEqual(4)
      expect(ticks[0]).toBeLessThanOrEqual(min)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max)
    }
  })

  test('the axis fits the data, so a narrow band of spending is not squashed flat against zero', () => {
    const ticks = niceTicks(2996.8, 3506.85)

    expect(ticks).not.toContain(0)
    expect(ticks[0]).toBeGreaterThan(2000)
  })

  test('zero is a tick whenever the line crosses it', () => {
    expect(niceTicks(-50, 120)).toContain(0)
  })

  test('money accrued gets its zero baseline even when every cycle was positive (MASTER 10)', () => {
    expect(niceTicks(120, 640, { includeZero: true })).toContain(0)
  })

  test('a flat line at zero is still an axis', () => {
    expect(niceTicks(0, 0)).toEqual([0])
  })

  // Rent is the same every cycle, and an axis of one tick would pin it to the top of a chart reading "$0".
  test('a category billed the same every cycle gets an axis around it', () => {
    const ticks = niceTicks(2200, 2200)

    expect(ticks.length).toBeGreaterThan(1)
    expect(Math.min(...ticks)).toBeLessThan(2200)
    expect(Math.max(...ticks)).toBeGreaterThan(2200)
  })
})
