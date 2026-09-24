import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CategoryRollup, Cycle, CycleSummary, Me } from '../../api/types'
import { addDays } from '../../format/dates'
import { db } from '../../offline/db'
import { configureOutbox, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext } from '../auth/useSession'
import { Onboarding } from './Onboarding'

test.each([
  ['2026-09-20', 29, '2026-10-19'],
  ['2026-12-15', 29, '2027-01-13'],
  ['2028-02-01', 29, '2028-03-01'],
  ['2026-09-20', -1, '2026-09-19'],
])('addDays(%s, %i) is %s', (date, days, expected) => expect(addDays(date, days)).toBe(expected))

const ME: Me = { id: 'u1', displayName: 'Ricky', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: false, cycleLengthDays: 30 }
const DRAFT: Cycle = { id: 'd1', startDate: '2026-09-20', endDate: '2026-10-19', status: 'Draft', phase: 'Current', openingBalance: 3000, closingBalance: null }
const FOOD: CategoryRollup = { categoryId: 'food', name: 'Groceries', icon: 'tag', colour: 'blue', type: 'Debit', budgeted: 700, actual: 0, remaining: 700, percentUsed: 0, status: 'OnTrack', spreadEvenly: true }

// A tiny in-memory server: what onboarding creates, it then reads back.
function backend({ cycles = [] as Cycle[], categories = [] as CategoryRollup[] } = {}) {
  const state = { cycles, categories, created: null as unknown, patched: null as unknown, confirmed: false }
  const summary = (cycle: Cycle): CycleSummary => ({
    cycle,
    rollup: { categories: state.categories, debitsBudgeted: 0, debitsActual: 0, creditsBudgeted: 0, creditsActual: 0, net: 0, accrued: null },
  })
  server.use(
    http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
    http.get('/api/cycles', () => HttpResponse.json(state.cycles)),
    http.get('/api/cycles/:id', ({ params }) => HttpResponse.json(summary(state.cycles.find((c) => c.id === params.id)!))),
    http.post('/api/cycles', async ({ request }) => {
      state.created = await request.json()
      const body = state.created as { startDate: string; openingBalance: number }
      state.cycles = [{ ...DRAFT, startDate: body.startDate, endDate: addDays(body.startDate, 29), openingBalance: body.openingBalance }]
      return HttpResponse.json(state.cycles[0], { status: 201 })
    }),
    http.patch('/api/cycles/d1', async ({ request }) => {
      state.patched = await request.json()
      state.cycles = [{ ...state.cycles[0], ...(state.patched as object) }]
      return HttpResponse.json(state.cycles[0])
    }),
    http.post('/api/cycles/d1/confirm', () => {
      state.confirmed = true
      state.cycles = [{ ...state.cycles[0], status: 'Confirmed' }]
      return HttpResponse.json(state.cycles[0])
    }),
  )
  return state
}

async function renderOnboarding() {
  await configureOutbox({ userId: 'u1', refresh: async () => undefined })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me: ME, signOut: async () => undefined }}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/onboarding']}>
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/" element={<p>Home screen</p>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // The evening of the 19th in UTC is already the 20th in Sydney.
  vi.setSystemTime(new Date('2026-09-19T21:30:00Z'))
  resetCsrf()
  stopOutbox()
  await db.outbox.clear()
  await db.cache.clear()
  return () => vi.useRealTimers()
})

describe('step 1: when it starts and what you have', () => {
  test('starts today where the user lives, and shows the end date it cannot change', async () => {
    backend()
    await renderOnboarding()

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-09-20')
    expect(screen.getByText('Ends 19 Oct. A cycle is always 30 days.')).toBeInTheDocument()
    // Nothing else is offered until the cycle exists.
    expect(screen.queryByRole('button', { name: 'Confirm budget' })).not.toBeInTheDocument()
  })

  test('the end date follows the start date', async () => {
    backend()
    await renderOnboarding()
    const start = await screen.findByLabelText('Start date')

    await userEvent.clear(start)
    await userEvent.type(start, '2026-12-15')

    expect(screen.getByText('Ends 13 Jan 2027. A cycle is always 30 days.')).toBeInTheDocument()
  })

  test('with more than one field wrong, a summary at the top links to each and takes the focus', async () => {
    const state = backend()
    await renderOnboarding()
    await userEvent.clear(await screen.findByLabelText('Start date'))

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const summary = screen.getByRole('alert')
    expect(summary).toHaveFocus()
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual(['Choose a start date.', 'Enter your opening balance, like 3000.00'])
    // And each message is also at its field.
    expect(screen.getByLabelText('Opening balance')).toHaveAccessibleDescription('Enter your opening balance, like 3000.00')
    expect(state.created).toBeNull()

    await userEvent.click(within(summary).getByRole('link', { name: /opening balance/ }))
    expect(screen.getByLabelText('Opening balance')).toHaveFocus()
  })

  test('with one field wrong, the focus goes straight to it', async () => {
    backend()
    await renderOnboarding()
    await screen.findByLabelText('Start date')

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Opening balance')).toHaveFocus()
  })

  test('Continue creates the draft cycle, and the next steps appear', async () => {
    const state = backend()
    await renderOnboarding()

    await userEvent.type(await screen.findByLabelText('Opening balance'), '3,000')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(state.created).toEqual({ startDate: '2026-09-20', openingBalance: 3000 }))
    expect(await screen.findByRole('button', { name: 'Add category' })).toBeInTheDocument()
  })
})

describe('coming back to a draft', () => {
  test('picks up where it was left: values filled in, categories listed', async () => {
    backend({ cycles: [DRAFT], categories: [FOOD] })
    await renderOnboarding()

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-09-20')
    expect(screen.getByLabelText('Opening balance')).toHaveValue('3000.00')
    expect(await screen.findByRole('heading', { level: 3, name: 'Groceries' })).toBeInTheDocument()
  })

  test('changing the date or balance updates the draft rather than making another', async () => {
    const state = backend({ cycles: [DRAFT] })
    await renderOnboarding()
    const balance = await screen.findByLabelText('Opening balance')

    await userEvent.clear(balance)
    await userEvent.type(balance, '3500')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(state.patched).toEqual({ openingBalance: 3500 }))
    expect(state.created).toBeNull()
  })

  test('cannot be confirmed without a category, and says why', async () => {
    backend({ cycles: [DRAFT] })
    await renderOnboarding()

    expect(await screen.findByText('Add at least one category first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm budget' })).toBeDisabled()
  })

  test('Confirm finishes onboarding and goes Home', async () => {
    const state = backend({ cycles: [DRAFT], categories: [FOOD] })
    await renderOnboarding()

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm budget' }))

    expect(await screen.findByText('Home screen')).toBeInTheDocument()
    expect(state.confirmed).toBe(true)
  })
})

test('someone who already has a confirmed cycle is sent Home', async () => {
  backend({ cycles: [{ ...DRAFT, status: 'Confirmed' }] })
  await renderOnboarding()

  expect(await screen.findByText('Home screen')).toBeInTheDocument()
})
