import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CategoryRollup, Cycle, CycleSummary, Me, PlanCatalogue, PlanLimits } from '../../api/types'
import { db } from '../../offline/db'
import { configureOutbox, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext } from '../auth/useSession'
import { Categories } from '../categories/Categories'
import { Cycles } from '../cycles/Cycles'
import { categoriesLeft, limitsOf } from './plan'
import { PlanSection } from './PlanSection'

const FREE: PlanLimits = { maxCategoriesPerCycle: 6, pastCyclesInReports: 1, trendChart: false }
const PREMIUM: PlanLimits = { maxCategoriesPerCycle: null, pastCyclesInReports: null, trendChart: true }
const BASE: Me = { id: 'u1', displayName: 'Sam', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: false, cycleLengthDays: 30 }
const ON_FREE: Me = { ...BASE, plan: 'free', planSource: null, limits: FREE }
const ON_PREMIUM: Me = { ...BASE, plan: 'premium', planSource: 'subscription', limits: PREMIUM }
const CATALOGUE: PlanCatalogue = { free: FREE, premium: PREMIUM, premiumPrice: { currency: 'AUD', monthly: 3.99, yearly: 29.99, trialDays: 14 } }

const cycle = (id: string, startDate: string, endDate: string, phase: Cycle['phase']): Cycle => ({ id, startDate, endDate, status: 'Confirmed', phase, openingBalance: 0, closingBalance: null })
const PAST = cycle('past', '2026-08-11', '2026-09-09', 'Past')
const CURRENT = cycle('cur', '2026-09-10', '2026-10-09', 'Current')

const row = (n: number): CategoryRollup => ({
  categoryId: `c${n}`, name: `Category ${n}`, icon: 'tag', colour: 'blue', type: 'Debit', budgeted: 100, actual: 0, remaining: 100, percentUsed: 0, status: 'OnTrack', spreadEvenly: true,
})
const summary = (of: Cycle, rows: number): CycleSummary => ({
  cycle: of,
  rollup: { categories: Array.from({ length: rows }, (_, n) => row(n + 1)), debitsBudgeted: 100 * rows, debitsActual: 0, creditsBudgeted: 0, creditsActual: 0, net: 0, accrued: null },
})

function renderWith(me: Me, screenElement: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me, signOut: async () => undefined }}>
        <ToastProvider>
          <MemoryRouter>{screenElement}</MemoryRouter>
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
}

async function categoriesFor(me: Me, rows: number) {
  server.use(
    http.get('/api/cycles', () => HttpResponse.json([CURRENT])),
    http.get('/api/cycles/cur', () => HttpResponse.json(summary(CURRENT, rows))),
  )
  renderWith(me, <Categories />)
  await screen.findByRole('heading', { level: 3, name: 'Category 1' })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'))
  vi.restoreAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  onlineManager.setOnline(true)
  resetCsrf()
  stopOutbox()
  localStorage.clear()
  await db.outbox.clear()
  await db.cache.clear()
  await configureOutbox({ userId: 'u1', refresh: async () => undefined })
  server.use(
    http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
    http.post('/api/sync', () => HttpResponse.error()),
  )
  return () => vi.useRealTimers()
})

describe('plan', () => {
  test('an answer with no plan locks nothing; the server still enforces the plan', () => {
    expect(limitsOf(BASE)).toEqual(PREMIUM)
    expect(categoriesLeft(BASE, 50)).toBeNull()
  })

  test('categories left counts down to zero and never below', () => {
    expect(categoriesLeft(ON_FREE, 4)).toBe(2)
    expect(categoriesLeft(ON_FREE, 6)).toBe(0)
    expect(categoriesLeft(ON_FREE, 9)).toBe(0)
    expect(categoriesLeft(ON_PREMIUM, 9)).toBeNull()
  })
})

describe('Category limit', () => {
  test('on Free, the count is shown while there is room', async () => {
    await categoriesFor(ON_FREE, 4)

    expect(screen.getByRole('button', { name: 'Add category' })).toBeEnabled()
    expect(screen.getByText('4 of 6 categories on the Free plan.')).toBeInTheDocument()
    expect(screen.queryByText('Premium')).not.toBeInTheDocument()
  })

  test('at six, adding is locked with a word and an icon, and the rows can still be edited', async () => {
    await categoriesFor(ON_FREE, 6)

    expect(screen.getByRole('button', { name: 'Add category' })).toBeDisabled()
    expect(screen.getByText('Up to 6 categories in a cycle')).toBeInTheDocument()
    expect(screen.getByTestId('badge')).toHaveTextContent('Premium')
    expect(screen.getByText(/This cycle has all 6 the Free plan allows/)).toHaveTextContent('Premium is coming soon in the app.')
    expect(screen.getByRole('button', { name: 'Edit Category 6' })).toBeEnabled()
  })

  test('a downgraded cycle over the limit keeps every row and says so', async () => {
    await categoriesFor(ON_FREE, 9)

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(9)
    expect(screen.getByRole('button', { name: 'Add category' })).toBeDisabled()
    expect(screen.getByText(/This cycle has 9, more than the 6 the Free plan allows/)).toBeInTheDocument()
  })

  test('Premium has no limit and no note', async () => {
    await categoriesFor(ON_PREMIUM, 9)

    expect(screen.getByRole('button', { name: 'Add category' })).toBeEnabled()
    expect(screen.queryByText(/Free plan/)).not.toBeInTheDocument()
  })

  test('if the server refuses anyway, its words are shown in the sheet', async () => {
    server.use(
      http.post('/api/cycles/cur/categories', () =>
        HttpResponse.json(
          { status: 422, code: 'plan.limit.categories', detail: 'The Free plan has up to 6 categories in a cycle. Premium has no limit.' },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    await categoriesFor(ON_FREE, 5)

    await userEvent.click(screen.getByRole('button', { name: 'Add category' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Add category' }))
    await userEvent.type(sheet.getByLabelText('Name'), 'Extra')
    await userEvent.type(sheet.getByLabelText('Budget'), '10')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    expect(await sheet.findByRole('alert')).toHaveTextContent('The Free plan has up to 6 categories in a cycle.')
  })
})

describe('Cycles on Free', () => {
  test('the trend is locked and the list says older cycles are kept', async () => {
    server.use(http.get('/api/reports/cycles', () => HttpResponse.json([summary(PAST, 1), summary(CURRENT, 1)])))
    renderWith(ON_FREE, <Cycles />)

    expect(await screen.findByText('Trend across every cycle')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Trend' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View as table' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText(/The Free plan lists your most recent past cycle/)).toHaveTextContent('Older cycles are kept, not deleted')
  })

  test('with no past cycle yet there is nothing older to mention', async () => {
    server.use(http.get('/api/reports/cycles', () => HttpResponse.json([summary(CURRENT, 1)])))
    renderWith(ON_FREE, <Cycles />)

    await screen.findAllByRole('link')
    expect(screen.queryByText(/The Free plan lists/)).not.toBeInTheDocument()
  })

  test('Premium gets the trend and no note', async () => {
    server.use(http.get('/api/reports/cycles', () => HttpResponse.json([summary(PAST, 1), summary(CURRENT, 1)])))
    renderWith(ON_PREMIUM, <Cycles />)

    expect(await screen.findByRole('button', { name: 'View as table' })).toBeInTheDocument()
    expect(screen.queryByText('Trend across every cycle')).not.toBeInTheDocument()
    expect(screen.queryByText(/The Free plan lists/)).not.toBeInTheDocument()
  })
})

describe('PlanSection', () => {
  test('Free says what it includes and what Premium adds, at the prices the server gives', async () => {
    server.use(http.get('/api/plans', () => HttpResponse.json(CATALOGUE)))
    renderWith(ON_FREE, <PlanSection />)

    const section = screen.getByRole('region', { name: 'Plan' })
    expect(within(section).getByText('Free')).toBeInTheDocument()
    expect(within(section).getByText(/Up to 6 categories in a cycle/)).toBeInTheDocument()
    await waitFor(() => expect(within(section).getByText('$3.99')).toHaveClass('num'))
    expect(within(section).getByText('$29.99')).toBeInTheDocument()
    expect(within(section).getByText(/14-day free trial/)).toBeInTheDocument()
    expect(within(section).getByText(/Premium is coming soon in the app\./)).toBeInTheDocument()
  })

  test('Free without the catalogue still renders, without prices', async () => {
    server.use(http.get('/api/plans', () => HttpResponse.error()))
    renderWith(ON_FREE, <PlanSection />)

    expect(screen.getByText('Unlimited categories and every past cycle')).toBeInTheDocument()
    expect(screen.queryByText('$3.99')).not.toBeInTheDocument()
  })

  test.each([
    ['demo', 'The demo shows every Premium feature.'],
    ['complimentary', 'Complimentary on this account.'],
    ['subscription', 'Through your subscription.'],
  ] as const)('Premium from %s says why', (planSource, why) => {
    renderWith({ ...ON_PREMIUM, planSource }, <PlanSection />)

    expect(within(screen.getByRole('region', { name: 'Plan' })).getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText(why)).toBeInTheDocument()
  })

  test('an answer from before plans existed shows no plan at all', () => {
    renderWith(BASE, <PlanSection />)

    expect(screen.queryByRole('region', { name: 'Plan' })).not.toBeInTheDocument()
  })
})
