import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import type { CategoryRollup, CycleSummary, Me } from '../../api/types'
import { server } from '../../test/server'
import { SessionContext } from '../auth/useSession'
import { categoryStatus } from './categoryStatus'
import { Home } from './Home'

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

function category(overrides: Partial<CategoryRollup>): CategoryRollup {
  const base = { categoryId: crypto.randomUUID(), name: 'Food', icon: 'utensils', colour: 'orange', type: 'Debit' as const, budgeted: 400, actual: 0 }
  const row = { ...base, ...overrides }
  return {
    remaining: row.budgeted - row.actual,
    percentUsed: row.budgeted === 0 ? null : (row.actual / row.budgeted) * 100,
    // What CycleRollup.Line decides; the front end only reads it.
    status: row.actual <= row.budgeted ? 'OnTrack' : row.type === 'Debit' ? 'Over' : 'Ahead',
    ...row,
  }
}

// MASTER 3.3, row by row.
describe('categoryStatus', () => {
  test.each([
    ['debit under 80%', { actual: 200 }, 'normal', '$200.00 left', undefined],
    ['debit just under 80%', { actual: 319.99 }, 'normal', '$80.01 left', undefined],
    ['debit at 80%', { actual: 320 }, 'warning', '$80.00 left', 'triangle-alert'],
    ['debit at exactly 100%', { actual: 400 }, 'warning', '$0.00 left', 'triangle-alert'],
    ['debit over', { actual: 420 }, 'negative', 'Over by $20.00', 'circle-alert'],
    ['debit with nothing budgeted and nothing spent', { budgeted: 0, actual: 0 }, 'normal', '$0.00 left', undefined],
    ['debit with nothing budgeted but something spent', { budgeted: 0, actual: 15 }, 'negative', 'Over by $15.00', 'circle-alert'],
    ['credit under', { type: 'Credit', budgeted: 5000, actual: 2500 }, 'normal', '$2,500.00 to go', undefined],
    ['credit at exactly 100%', { type: 'Credit', budgeted: 800, actual: 800 }, 'positive', 'Received', 'check'],
    ['credit over', { type: 'Credit', budgeted: 20, actual: 24 }, 'positive', 'Ahead by $4.00', 'trending-up'],
    ['credit with nothing expected yet', { type: 'Credit', budgeted: 0, actual: 0 }, 'normal', '$0.00 to go', undefined],
  ] as const)('%s', (_, overrides, tone, word, icon) => {
    const status = categoryStatus(category(overrides), 'AUD')

    expect(status.tone).toBe(tone)
    expect(status.word).toBe(word)
    expect(status.icon).toBe(icon)
  })

  test('over and ahead come from the API, not from comparing the numbers here', () => {
    // A row the server calls OnTrack stays that way even if its numbers look over.
    const row = { ...category({ actual: 420 }), status: 'OnTrack' as const }

    expect(categoryStatus(row, 'AUD').tone).not.toBe('negative')
  })
})

const SUMMARY: CycleSummary = {
  cycle: { id: 'c1', startDate: '2026-09-10', endDate: '2026-10-09', status: 'Confirmed', phase: 'Current', openingBalance: 3620.25, closingBalance: null },
  rollup: {
    categories: [
      category({ name: 'Salary', icon: 'banknote', colour: 'blue', type: 'Credit', budgeted: 5200, actual: 5200 }),
      category({ name: 'Rent', icon: 'house', colour: 'slate', budgeted: 2200, actual: 2200 }),
      category({ name: 'Groceries', icon: 'shopping-cart', budgeted: 700, actual: 242.9 }),
      category({ name: 'Eating out', icon: 'utensils', colour: 'pink', budgeted: 300, actual: 340 }),
    ],
    debitsBudgeted: 3200,
    debitsActual: 2782.9,
    creditsBudgeted: 5200,
    creditsActual: 5200,
    net: 2417.1,
    accrued: null,
  },
}

function renderHome() {
  // 20 Sep in Sydney: day 11 of the cycle that started on the 10th.
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'))
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me: ME, signOut: async () => undefined }}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </SessionContext>
    </QueryClientProvider>,
  )
}

describe('Home', () => {
  test('the cycle header: dates, day, and the one hero amount', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    server.use(http.get('/api/cycles/current', () => HttpResponse.json(SUMMARY)))
    renderHome()

    expect(await screen.findByText('10 Sep to 9 Oct · day 11 of 30')).toBeInTheDocument()
    expect(screen.getByText('$2,782.90')).toHaveClass('num')
    expect(screen.getByText('spent of $3,200.00 budgeted')).toBeInTheDocument()
    expect(screen.getByText('$5,200.00 received of $5,200.00 expected')).toBeInTheDocument()
    vi.useRealTimers()
  })

  test('spending and income are separate sections, in the order the API gives', async () => {
    server.use(http.get('/api/cycles/current', () => HttpResponse.json(SUMMARY)))
    renderHome()

    const spending = within(await screen.findByRole('region', { name: 'Spending' }))
    const income = within(screen.getByRole('region', { name: 'Income' }))

    expect(spending.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Rent', 'Groceries', 'Eating out'])
    expect(income.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Salary'])
  })

  test('a row shows spent against budget, a bar that says the whole sentence, and the status in words', async () => {
    server.use(http.get('/api/cycles/current', () => HttpResponse.json(SUMMARY)))
    renderHome()

    const row = within((await screen.findByRole('heading', { level: 3, name: 'Eating out' })).closest('li')!)

    expect(row.getByText('$340.00 / $300.00')).toHaveClass('num')
    expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Eating out: $340.00 of $300.00, Over by $40.00')
    expect(row.getByText('Over by $40.00')).toBeInTheDocument()
  })

  test.each([
    ['nobody has a cycle yet', () => HttpResponse.json({ status: 404, code: 'cycle.none' }, { status: 404 })],
    ['the first cycle is still a draft', () => HttpResponse.json({ ...SUMMARY, cycle: { ...SUMMARY.cycle, status: 'Draft' } })],
  ])('when %s, Home points at setting one up', async (_, response) => {
    server.use(http.get('/api/cycles/current', response))
    renderHome()

    expect(await screen.findByText('No budget yet. Set up your first cycle.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set up your first cycle' })).toHaveAttribute('href', '/onboarding')
  })

  test('a cycle with no categories says so instead of showing two empty sections', async () => {
    server.use(http.get('/api/cycles/current', () => HttpResponse.json({ ...SUMMARY, rollup: { ...SUMMARY.rollup, categories: [] } })))
    renderHome()

    expect(await screen.findByText('This cycle has no categories yet.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Spending' })).not.toBeInTheDocument()
  })

  test('while loading it says so and holds the space', () => {
    server.use(http.get('/api/cycles/current', () => new Promise(() => undefined)))
    renderHome()

    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  test('a failure offers another go', async () => {
    server.use(http.get('/api/cycles/current', () => HttpResponse.json({ status: 500, code: 'http.500' }, { status: 500 })))
    renderHome()

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
