import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CategoryRollup, CycleSummary, Me, SyncItem, Transaction } from '../../api/types'
import { db } from '../../offline/db'
import { configureOutbox, drain, enqueue, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext } from '../auth/useSession'
import { CategoryTransactions } from './CategoryTransactions'
import { ClosingBalancePrompt } from './ClosingBalancePrompt'

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

const row = (categoryId: string, name: string, type: 'Debit' | 'Credit'): CategoryRollup => ({
  categoryId, name, icon: 'tag', colour: 'blue', type, budgeted: 100, actual: 0, remaining: 100, percentUsed: 0, status: 'OnTrack', spreadEvenly: true,
})

const SUMMARY: CycleSummary = {
  cycle: { id: 'c1', startDate: '2026-09-10', endDate: '2026-10-09', status: 'Confirmed', phase: 'Current', openingBalance: 0, closingBalance: null },
  rollup: {
    categories: [row('food', 'Groceries', 'Debit'), row('fun', 'Fun', 'Debit'), row('pay', 'Salary', 'Credit')],
    debitsBudgeted: 200, debitsActual: 0, creditsBudgeted: 100, creditsActual: 0, net: 0, accrued: null,
  },
}

const tx = (clientId: string, categoryId: string, amount: number, occurredOn: string, note: string | null = null): Transaction => ({
  id: `id-${clientId}`, clientId, cycleId: 'c1', categoryId, amount, occurredOn, note, createdAt: `${occurredOn}T01:00:00Z`, updatedAt: `${occurredOn}T01:00:00Z`,
})

const SERVER = [tx('a', 'food', 42.9, '2026-09-12', 'Weekly shop'), tx('b', 'food', 8, '2026-09-18'), tx('c', 'fun', 30, '2026-09-15', 'Cinema')]

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

async function renderPage({ transactions = SERVER, online = false } = {}) {
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'))
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  server.use(
    http.get('/api/cycles/c1', () => HttpResponse.json(SUMMARY)),
    http.get('/api/transactions', ({ request }) => (new URL(request.url).searchParams.get('cycleId') === 'c1' ? HttpResponse.json(transactions) : HttpResponse.json([]))),
  )
  await configureOutbox({ userId: 'u1', refresh: async () => undefined })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me: ME, signOut: async () => undefined }}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/cycles/c1/categories/food']}>
            <ClosingBalancePrompt />
            <Where />
            <Routes>
              <Route path="/cycles/:cycleId/categories/:categoryId" element={<CategoryTransactions />} />
              <Route path="*" element={null} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Groceries' })
}

const queued = async () => await db.outbox.orderBy('seq').toArray()
const rows = () => screen.getAllByRole('listitem').map((item) => item.textContent)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  resetCsrf()
  stopOutbox()
  localStorage.clear()
  await db.outbox.clear()
  await db.cache.clear()
  return () => vi.useRealTimers()
})

describe('a category\'s transactions', () => {
  test('lists only that category, newest first, with date, note and amount', async () => {
    await renderPage()

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[0]).toContain('18 Sep')
    expect(rows()[0]).toContain('$8.00')
    expect(rows()[1]).toContain('12 Sep')
    expect(rows()[1]).toContain('Weekly shop')
    expect(rows()[1]).toContain('$42.90')
  })

  test('says so when there are none', async () => {
    await renderPage({ transactions: [] })

    expect(await screen.findByText('No transactions in Groceries this cycle.')).toBeInTheDocument()
  })

  test('one queued offline is already in the list', async () => {
    await renderPage()
    await waitFor(() => expect(rows()).toHaveLength(2))

    await enqueue({ type: 'transaction.create', create: { clientId: 'new', cycleId: 'c1', categoryId: 'food', amount: 5.5, occurredOn: '2026-09-20', note: 'Milk' } })

    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(rows()[0]).toContain('Milk')
  })
})

describe('editing', () => {
  async function openEdit(note: string) {
    await renderPage()
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(note) }))
    return within(await screen.findByRole('dialog', { name: 'Edit transaction' }))
  }

  test('opens the same sheet, filled in', async () => {
    const sheet = await openEdit('Weekly shop')

    expect(sheet.getByLabelText('Amount')).toHaveTextContent('$42.9')
    expect(sheet.getByRole('radio', { name: 'Spending' })).toBeChecked()
    expect(sheet.getByRole('radio', { name: 'Groceries' })).toBeChecked()
    expect(sheet.getByLabelText('Date')).toHaveValue('2026-09-12')
    expect(sheet.getByLabelText('Note')).toHaveValue('Weekly shop')
  })

  test('queues only what changed, with what it looked like before so the totals can follow', async () => {
    const sheet = await openEdit('Weekly shop')

    await userEvent.click(sheet.getByRole('button', { name: 'Backspace' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Backspace' }))
    await userEvent.click(sheet.getByRole('radio', { name: 'Fun' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toHaveLength(1))
    expect((await queued())[0]).toMatchObject({
      item: { type: 'transaction.edit', clientId: 'a', edit: { amount: 42, categoryId: 'fun' } },
      before: { cycleId: 'c1', categoryId: 'food', amount: 42.9 },
    })
    // It left this category, so it left this list.
    await waitFor(() => expect(rows()).toHaveLength(1))
  })

  test('saving without changing anything queues nothing', async () => {
    const sheet = await openEdit('Weekly shop')

    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await queued()).toEqual([])
  })

  test('delete asks first, and the safe choice does nothing', async () => {
    const sheet = await openEdit('Weekly shop')

    await userEvent.click(sheet.getByRole('button', { name: 'Delete' }))
    const confirm = within(await screen.findByRole('dialog', { name: 'Delete this transaction?' }))
    await userEvent.click(confirm.getByRole('button', { name: 'Cancel' }))

    expect(await queued()).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument()
  })

  test('confirming the delete queues it and the row goes', async () => {
    const sheet = await openEdit('Weekly shop')

    await userEvent.click(sheet.getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this transaction?' })).getByRole('button', { name: 'Delete' }))

    await waitFor(async () => expect(await queued()).toHaveLength(1))
    expect((await queued())[0]).toMatchObject({ item: { type: 'transaction.delete', clientId: 'a' }, before: { cycleId: 'c1', categoryId: 'food', amount: 42.9 } })
    await waitFor(() => expect(rows()).toHaveLength(1))
  })
})

// Story "Transactions 4": a write to a past cycle prompts for that cycle's closing balance. The server decides that
// (requiresClosingBalanceReview on the sync result); the client never works it out from dates.
describe('a change that landed in a past cycle', () => {
  function syncAnswers(requiresClosingBalanceReview: boolean) {
    server.use(
      http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
      http.post('/api/sync', async ({ request }) => {
        const { items } = (await request.json()) as { items: SyncItem[] }
        return HttpResponse.json(items.map((_, index) => ({ index, ok: true, result: { requiresClosingBalanceReview } })))
      }),
    )
  }
  const create: SyncItem = { type: 'transaction.create', create: { clientId: 'late', cycleId: 'c1', categoryId: 'food', amount: 5, occurredOn: '2026-09-11', note: null } }

  test('offers to update that cycle\'s closing balance, and takes you there', async () => {
    syncAnswers(true)
    await renderPage({ online: true })

    await enqueue(create)
    await drain()

    const prompt = within(await screen.findByRole('dialog', { name: 'You changed a past cycle' }))
    expect(prompt.getByText('Update its closing balance too?')).toBeInTheDocument()
    await userEvent.click(prompt.getByRole('button', { name: 'Update balance' }))

    expect(screen.getByTestId('where')).toHaveTextContent('/cycles/c1')
    expect(screen.queryByRole('dialog', { name: 'You changed a past cycle' })).not.toBeInTheDocument()
  })

  test('"Not now" just closes it', async () => {
    syncAnswers(true)
    await renderPage({ online: true })
    await enqueue(create)
    await drain()

    await userEvent.click(within(await screen.findByRole('dialog', { name: 'You changed a past cycle' })).getByRole('button', { name: 'Not now' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/cycles/c1/categories/food')
  })

  test('nothing is asked when the server does not flag it', async () => {
    syncAnswers(false)
    await renderPage({ online: true })

    await enqueue(create)
    await drain()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
