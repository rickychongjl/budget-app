import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CategoryRollup, Cycle, CycleSummary, Me } from '../../api/types'
import { parseMoney } from '../../format/money'
import { db } from '../../offline/db'
import { configureOutbox, enqueue, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext } from '../auth/useSession'
import { CycleDetail } from './CycleDetail'
import { Cycles } from './Cycles'

describe('parseMoney', () => {
  test.each([
    ['1200', 1200],
    ['1,200.50', 1200.5],
    [' $3,620.25 ', 3620.25],
    ['-50', -50],
    ['−$50.00', -50],
    ['0', 0],
    ['.5', 0.5],
  ])('"%s" is %s', (text, amount) => expect(parseMoney(text)).toBe(amount))

  test.each(['', 'abc', '12.345', '1.2.3', '--5', '5-'])('"%s" is not an amount', (text) => expect(parseMoney(text)).toBeNull())
})

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

const cycle = (id: string, startDate: string, endDate: string, phase: Cycle['phase'], opening: number | null, closing: number | null, status: Cycle['status'] = 'Confirmed'): Cycle => ({
  id, startDate, endDate, status, phase, openingBalance: opening, closingBalance: closing,
})

// Oldest first, as the API returns them.
const CYCLES = [
  cycle('p1', '2026-07-12', '2026-08-10', 'Past', 3000, 3120),
  cycle('p2', '2026-08-11', '2026-09-09', 'Past', 3120, 3070),
  cycle('cur', '2026-09-10', '2026-10-09', 'Current', 3070, null),
  cycle('fut', '2026-10-10', '2026-11-08', 'Future', null, null),
]

const row = (categoryId: string, name: string, type: 'Debit' | 'Credit', budgeted: number, actual: number): CategoryRollup => ({
  categoryId, name, icon: 'tag', colour: 'blue', type, budgeted, actual, remaining: budgeted - actual, percentUsed: (actual / budgeted) * 100, status: actual > budgeted ? (type === 'Debit' ? 'Over' : 'Ahead') : 'OnTrack',
})

// What each cycle spent of the same $700 budget, so a row's own figures can be told apart from its neighbour's.
const SPENT: Record<string, number> = { p1: 500, p2: 640, cur: 120, fut: 0 }

const summaryOf = (of: Cycle): CycleSummary => {
  const spent = SPENT[of.id]
  return {
    cycle: of,
    rollup: {
      categories: [row('food', 'Groceries', 'Debit', 700, spent), row('pay', 'Salary', 'Credit', 5200, 5200)],
      debitsBudgeted: 700, debitsActual: spent, creditsBudgeted: 5200, creditsActual: 5200, net: 5200 - spent,
      accrued: of.openingBalance !== null && of.closingBalance !== null ? of.closingBalance - of.openingBalance : null,
    },
  }
}

const REPORT = CYCLES.map(summaryOf)

function renderAt(path: string) {
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'))
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me: ME, signOut: async () => undefined }}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/cycles" element={<Cycles />} />
              <Route path="/cycles/:id" element={<CycleDetail />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  resetCsrf()
  stopOutbox()
  await db.outbox.clear()
  await db.cache.clear()
  server.use(
    http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
    http.get('/api/reports/cycles', () => HttpResponse.json(REPORT)),
    http.get('/api/cycles/:id', ({ params }) => HttpResponse.json(summaryOf(CYCLES.find((c) => c.id === params.id)!))),
  )
  return () => vi.useRealTimers()
})

describe('Cycles', () => {
  test('lists every cycle, newest first, each with its dates and a status in words', async () => {
    renderAt('/cycles')

    const rows = await screen.findAllByRole('link')
    expect(rows.map((link) => within(link).getByRole('heading', { level: 2 }).textContent)).toEqual(['10 Oct to 8 Nov', '10 Sep to 9 Oct', '11 Aug to 9 Sep', '12 Jul to 10 Aug'])
    expect(rows.map((link) => within(link).getByTestId('badge').textContent)).toEqual(['Upcoming', 'Current', 'Past', 'Past'])
    expect(rows[1]).toHaveAttribute('href', '/cycles/cur')
  })

  test('money accrued has a sign and a word as well as a colour, and is absent until both balances are known', async () => {
    renderAt('/cycles')
    const rows = await screen.findAllByRole('link')

    // 3,120 - 3,000 and 3,070 - 3,120.
    expect(within(rows[3]).getByText('+$120.00 accrued')).toBeInTheDocument()
    expect(within(rows[2]).getByText('−$50.00 accrued')).toBeInTheDocument()
    expect(within(rows[1]).queryByText(/accrued/)).not.toBeInTheDocument()
  })

  test('a first cycle that is not confirmed yet says Draft', async () => {
    const draft = cycle('d', '2026-09-10', '2026-10-09', 'Current', null, null, 'Draft')
    server.use(http.get('/api/reports/cycles', () => HttpResponse.json([{ ...summaryOf({ ...draft, id: 'cur' }), cycle: draft }])))
    renderAt('/cycles')

    expect(await screen.findByTestId('badge')).toHaveTextContent('Draft')
  })

  test('says so when there are none', async () => {
    server.use(http.get('/api/reports/cycles', () => HttpResponse.json([])))
    renderAt('/cycles')

    expect(await screen.findByText('No cycles yet.')).toBeInTheDocument()
  })

  test('each row says what was spent against what was budgeted (MASTER 9)', async () => {
    renderAt('/cycles')
    const rows = await screen.findAllByRole('link')

    expect(within(rows[3]).getByText('$500.00 of $700.00 spent')).toBeInTheDocument()
    expect(within(rows[2]).getByText('$640.00 of $700.00 spent')).toBeInTheDocument()
    expect(within(rows[1]).getByText('$120.00 of $700.00 spent')).toBeInTheDocument()
  })

  test('a transaction waiting in the outbox counts towards its own cycle and no other', async () => {
    renderAt('/cycles')
    await screen.findAllByRole('link')

    await configureOutbox({ userId: 'u1', refresh: async () => undefined })
    await act(async () => {
      await enqueue({ type: 'transaction.create', create: { clientId: 'tx-1', cycleId: 'cur', categoryId: 'food', amount: 30, occurredOn: '2026-09-20', note: null } })
    })

    const rows = await screen.findAllByRole('link')
    expect(within(rows[1]).getByText('$150.00 of $700.00 spent')).toBeInTheDocument()
    expect(within(rows[2]).getByText('$640.00 of $700.00 spent')).toBeInTheDocument()
  })

  test('the last report renders before the network answers', async () => {
    const stale = [{ ...summaryOf(CYCLES[0]), cycle: { ...CYCLES[0], id: 'old' } }]
    await db.cache.put({ key: 'u1:cycles/report', userId: 'u1', json: stale, at: 1 })
    server.use(http.get('/api/reports/cycles', () => new Promise(() => {})))
    renderAt('/cycles')

    expect(await screen.findByRole('heading', { level: 2, name: '12 Jul to 10 Aug' })).toBeInTheDocument()
  })
})

describe('CycleDetail', () => {
  test('is that cycle\'s Home: totals, then category rows that open its own transactions', async () => {
    renderAt('/cycles/p2')

    expect(await screen.findByRole('heading', { level: 1, name: '11 Aug to 9 Sep' })).toBeInTheDocument()
    expect(screen.getByText('$640.00')).toBeInTheDocument()
    expect(screen.getByText('spent of $700.00 budgeted')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Groceries/ })).toHaveAttribute('href', '/cycles/p2/categories/food')
  })

  test('shows both balances and what was accrued', async () => {
    renderAt('/cycles/p2')

    const balances = within(await screen.findByRole('region', { name: 'Balances' }))
    expect(balances.getByText('$3,120.00')).toBeInTheDocument()
    expect(balances.getByLabelText('Closing balance')).toHaveValue('3070.00')
    expect(balances.getByText('−$50.00 accrued')).toBeInTheDocument()
  })

  test('saving a closing balance sends just that, and says it carries forward', async () => {
    let body: unknown
    server.use(http.patch('/api/cycles/p2', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json(cycle('p2', '2026-08-11', '2026-09-09', 'Past', 3120, 3100))
    }))
    renderAt('/cycles/p2')
    const field = await screen.findByLabelText('Closing balance')

    await userEvent.clear(field)
    await userEvent.type(field, '3,100')
    await userEvent.click(screen.getByRole('button', { name: 'Save balance' }))

    await waitFor(() => expect(body).toEqual({ closingBalance: 3100 }))
    expect(await screen.findByText('Saved. It is now the next cycle\'s opening balance.')).toBeInTheDocument()
  })

  test('something that is not an amount is caught at the field and nothing is sent', async () => {
    let sent = false
    server.use(http.patch('/api/cycles/p2', () => ((sent = true), HttpResponse.json({}))))
    renderAt('/cycles/p2')
    const field = await screen.findByLabelText('Closing balance')

    await userEvent.clear(field)
    await userEvent.type(field, 'lots')
    await userEvent.click(screen.getByRole('button', { name: 'Save balance' }))

    expect(field).toHaveAccessibleDescription('Enter an amount, like 3070.00')
    expect(field).toHaveFocus()
    expect(sent).toBe(false)
  })

  test('a refusal from the server is shown at the field in its own words', async () => {
    server.use(http.patch('/api/cycles/p2', () => HttpResponse.json({ status: 422, code: 'cycle.read-only', detail: 'That cannot be changed on this cycle.' }, { status: 422 })))
    renderAt('/cycles/p2')
    const field = await screen.findByLabelText('Closing balance')

    await userEvent.clear(field)
    await userEvent.type(field, '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save balance' }))

    await waitFor(() => expect(field).toHaveAccessibleDescription('That cannot be changed on this cycle.'))
  })

  test('an upcoming cycle has no closing balance to enter', async () => {
    renderAt('/cycles/fut')

    await screen.findByRole('heading', { level: 1, name: '10 Oct to 8 Nov' })
    expect(screen.queryByLabelText('Closing balance')).not.toBeInTheDocument()
  })

  test('offline, the balance cannot be saved and the reason is on screen', async () => {
    renderAt('/cycles/p2')
    await screen.findByLabelText('Closing balance')

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))

    expect(screen.getByRole('button', { name: 'Save balance' })).toBeDisabled()
    expect(screen.getByText('Needs a connection.')).toBeInTheDocument()
  })
})
