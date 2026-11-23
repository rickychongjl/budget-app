import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CategoryRollup, Cycle, CycleSummary, Me } from '../../api/types'
import { db } from '../../offline/db'
import { configureOutbox, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext } from '../auth/useSession'
import { Categories } from './Categories'

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

const cycle = (id: string, startDate: string, endDate: string, phase: Cycle['phase']): Cycle => ({ id, startDate, endDate, status: 'Confirmed', phase, openingBalance: 0, closingBalance: null })
const CYCLES = [cycle('past', '2026-08-11', '2026-09-09', 'Past'), cycle('cur', '2026-09-10', '2026-10-09', 'Current'), cycle('fut', '2026-10-10', '2026-11-08', 'Future')]

const row = (categoryId: string, name: string, type: 'Debit' | 'Credit', colour: string, budgeted: number): CategoryRollup => ({
  categoryId, name, icon: 'tag', colour, type, budgeted, actual: 0, remaining: budgeted, percentUsed: 0, status: 'OnTrack', spreadEvenly: true, autoPay: false,
})
const ROWS = [row('pay', 'Salary', 'Credit', 'blue', 5200), row('rent', 'Rent', 'Debit', 'slate', 2200), row('food', 'Groceries', 'Debit', 'orange', 700), row('fun', 'Fun', 'Debit', 'violet', 200)]
const summaryOf = (of: Cycle): CycleSummary => ({
  cycle: of,
  rollup: { categories: ROWS, debitsBudgeted: 3100, debitsActual: 0, creditsBudgeted: 5200, creditsActual: 0, net: 0, accrued: null },
})

async function renderScreen({ online = true } = {}) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  await configureOutbox({ userId: 'u1', refresh: async () => undefined })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me: ME, signOut: async () => undefined }}>
        <ToastProvider>
          <MemoryRouter>
            <Categories />
          </MemoryRouter>
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { level: 3, name: 'Groceries' })
}

const names = (section: string) => within(screen.getByRole('region', { name: section })).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
const queued = async () => (await db.outbox.orderBy('seq').toArray()).map((entry) => entry.item)
const openEdit = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: `Edit ${name}` }))
  return within(await screen.findByRole('dialog', { name: `Edit ${name}` }))
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'))
  // The connection spies below are per test: left in place, one test's "offline" is the next test's starting state.
  vi.restoreAllMocks()
  // onlineManager is one object for the whole module. The offline test dispatches a real `offline` event, which pauses
  // every query after it until an `online` one arrives, so each test starts connected and says otherwise if it means it.
  onlineManager.setOnline(true)
  resetCsrf()
  stopOutbox()
  localStorage.clear()
  await db.outbox.clear()
  await db.cache.clear()
  server.use(
    http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
    http.get('/api/cycles', () => HttpResponse.json(CYCLES)),
    http.get('/api/cycles/:id', ({ params }) => HttpResponse.json(summaryOf(CYCLES.find((c) => c.id === params.id)!))),
    // Anything queued here must not be sent during the test.
    http.post('/api/sync', () => HttpResponse.error()),
  )
  return () => vi.useRealTimers()
})

describe('Categories', () => {
  test('shows the current cycle\'s categories with their budgets, spending and income apart', async () => {
    await renderScreen()

    expect(names('Spending')).toEqual(['Rent', 'Groceries', 'Fun'])
    expect(names('Income')).toEqual(['Salary'])
    expect(within(screen.getByRole('region', { name: 'Spending' })).getByText('$700.00')).toHaveClass('num')
  })

  test('only the current and upcoming cycles can be chosen: a past cycle\'s categories are read-only', async () => {
    await renderScreen()

    const picker = screen.getByLabelText('Cycle')
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['10 Sep to 9 Oct (current)', '10 Oct to 8 Nov'])
    expect(picker).toHaveValue('cur')
  })
})

describe('editing a category works offline', () => {
  test('queues only what changed, and the list shows it at once', async () => {
    await renderScreen({ online: false })
    const sheet = await openEdit('Groceries')

    await userEvent.clear(sheet.getByLabelText('Name'))
    await userEvent.type(sheet.getByLabelText('Name'), 'Food')
    await userEvent.clear(sheet.getByLabelText('Budget'))
    await userEvent.type(sheet.getByLabelText('Budget'), '650')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'food', category: { name: 'Food', budgetAmount: 650 } }]))
    expect(await screen.findByRole('heading', { level: 3, name: 'Food' })).toBeInTheDocument()
    expect(screen.getByText('$650.00')).toBeInTheDocument()
  })

  test('marking a spending category as paid in one go is queued like any other field', async () => {
    await renderScreen({ online: false })
    const sheet = await openEdit('Rent')
    expect(sheet.getByRole('radio', { name: 'Over the cycle' })).toBeChecked()

    await userEvent.click(sheet.getByRole('radio', { name: 'In one go' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'rent', category: { spreadEvenly: false } }]))
  })

  test('a bill paid in one go can be marked as paid when a new cycle starts', async () => {
    server.use(http.get('/api/transactions', () => HttpResponse.json([])))
    await renderScreen({ online: false })
    const sheet = await openEdit('Rent')
    const autoPay = () => sheet.queryByRole('button', { name: 'Mark as paid when a new cycle starts' })
    expect(autoPay()).not.toBeInTheDocument()

    await userEvent.click(sheet.getByRole('radio', { name: 'In one go' }))
    expect(autoPay()).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(autoPay()!)
    expect(autoPay()).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Mark Rent as paid for this cycle too?' })).getByRole('button', { name: 'Not now' }))

    await waitFor(async () => expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'rent', category: { spreadEvenly: false, autoPay: true } }]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  const turnOnAutoPay = async (sheet: ReturnType<typeof within>) => {
    await userEvent.click(sheet.getByRole('radio', { name: 'In one go' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Mark as paid when a new cycle starts' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))
  }

  test('turning auto-pay on mid-cycle offers to pay this cycle when the bill has no transactions in it yet', async () => {
    server.use(http.get('/api/transactions', () => HttpResponse.json([])))
    await renderScreen({ online: false })
    await turnOnAutoPay(await openEdit('Rent'))

    const prompt = within(await screen.findByRole('dialog', { name: 'Mark Rent as paid for this cycle too?' }))
    expect(prompt.getByText(/\$2,200\.00/)).toBeInTheDocument()
    await userEvent.click(prompt.getByRole('button', { name: 'Mark as paid' }))

    await waitFor(async () => expect(await queued()).toEqual([
      { type: 'category.edit', cycleId: 'cur', categoryId: 'rent', category: { spreadEvenly: false, autoPay: true } },
      { type: 'transaction.create', create: { clientId: expect.any(String), cycleId: 'cur', categoryId: 'rent', amount: 2200, occurredOn: '2026-09-20', note: 'Auto-paid' } },
    ]))
  })

  test('a bill that already has a transaction this cycle is not offered a second payment', async () => {
    server.use(http.get('/api/transactions', () => HttpResponse.json([
      { id: 't1', clientId: 'c1', cycleId: 'cur', categoryId: 'rent', amount: 2200, occurredOn: '2026-09-11', note: null, createdAt: '2026-09-11T00:00:00Z', updatedAt: '2026-09-11T00:00:00Z' },
    ])))
    await renderScreen({ online: false })
    await turnOnAutoPay(await openEdit('Rent'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'rent', category: { spreadEvenly: false, autoPay: true } }])
  })

  test('an upcoming cycle is paid by its own start, so it is not offered a payment now', async () => {
    await renderScreen({ online: false })
    await userEvent.selectOptions(screen.getByLabelText('Cycle'), 'fut')
    await screen.findByRole('heading', { level: 3, name: 'Groceries' })
    await turnOnAutoPay(await openEdit('Rent'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'fut', categoryId: 'rent', category: { spreadEvenly: false, autoPay: true } }])
  })

  test('spreading an auto-paid bill over the cycle turns auto-pay off with it', async () => {
    const autoPaid = ROWS.map((r) => (r.categoryId === 'rent' ? { ...r, spreadEvenly: false, autoPay: true } : r))
    const summary = summaryOf(CYCLES[1])
    server.use(http.get('/api/cycles/:id', () => HttpResponse.json({ ...summary, rollup: { ...summary.rollup, categories: autoPaid } })))
    await renderScreen({ online: false })
    const sheet = await openEdit('Rent')
    expect(sheet.getByRole('button', { name: 'Mark as paid when a new cycle starts' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(sheet.getByRole('radio', { name: 'Over the cycle' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'rent', category: { spreadEvenly: true, autoPay: false } }]))
  })

  test('income has no pace, so it is not asked how it is spent', async () => {
    await renderScreen({ online: false })
    const sheet = await openEdit('Salary')

    expect(sheet.queryByRole('radiogroup', { name: 'How is it spent?' })).not.toBeInTheDocument()
  })

  test('icon and colour are chosen from the fixed sets, and the colour is stored as a slot name', async () => {
    await renderScreen({ online: false })
    const sheet = await openEdit('Groceries')
    expect(sheet.getByRole('radio', { name: 'orange' })).toBeChecked()

    await userEvent.click(sheet.getByRole('radio', { name: 'teal' }))
    await userEvent.click(sheet.getByRole('radio', { name: 'shopping-cart' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'food', category: { icon: 'shopping-cart', colour: 'teal' } }]))
  })

  test.each([
    ['Name', '', 'Give the category a name.'],
    ['Budget', 'lots', 'Enter an amount, like 700.00'],
    ['Budget', '-5', 'A budget cannot be negative.'],
  ])('%s "%s" is caught at the field and nothing is queued', async (label, value, message) => {
    await renderScreen({ online: false })
    const sheet = await openEdit('Groceries')

    await userEvent.clear(sheet.getByLabelText(label))
    if (value) {
      await userEvent.type(sheet.getByLabelText(label), value)
    }
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    expect(sheet.getByLabelText(label)).toHaveAccessibleDescription(message)
    expect(sheet.getByLabelText(label)).toHaveFocus()
    expect(await queued()).toEqual([])
  })

  test('an answer that leaves out how it is spent never turns a bill into a spread cost', async () => {
    // An older API omits spreadEvenly. Saving something else must then say nothing about how it is spent, or a bill
    // marked "In one go" would quietly become a spread one.
    const legacy = ROWS.map((r) => ({ ...r, spreadEvenly: undefined })) as unknown as CategoryRollup[]
    const summary = summaryOf(CYCLES[1])
    server.use(http.get('/api/cycles/:id', () => HttpResponse.json({ ...summary, rollup: { ...summary.rollup, categories: legacy } })))

    await renderScreen({ online: false })
    const sheet = await openEdit('Groceries')
    await userEvent.clear(sheet.getByLabelText('Name'))
    await userEvent.type(sheet.getByLabelText('Name'), 'Food')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toEqual([{ type: 'category.edit', cycleId: 'cur', categoryId: 'food', category: { name: 'Food' } }]))
  })

  test('saving with nothing changed queues nothing', async () => {
    await renderScreen({ online: false })
    const sheet = await openEdit('Groceries')

    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await queued()).toEqual([])
  })
})

describe('adding and removing need a connection', () => {
  test('a new category goes straight to the server, with the next unused colour and the end of the list', async () => {
    let body: unknown
    server.use(http.post('/api/cycles/cur/categories', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({}, { status: 201 })
    }))
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Add category' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Add category' }))
    // blue, slate, orange and violet are taken; cyan is the first slot nobody has.
    expect(sheet.getByRole('radio', { name: 'cyan' })).toBeChecked()
    await userEvent.click(sheet.getByRole('radio', { name: 'Income' }))
    await userEvent.type(sheet.getByLabelText('Name'), 'Interest')
    await userEvent.type(sheet.getByLabelText('Budget'), '20')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(body).toEqual({ type: 'Credit', name: 'Interest', icon: 'tag', colour: 'cyan', sortOrder: 4, budgetAmount: 20 }))
    expect(await queued()).toEqual([])
  })

  test('a new spending category says how it is spent, over the cycle unless told otherwise', async () => {
    let body: unknown
    server.use(http.post('/api/cycles/cur/categories', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ categoryId: 'ins' }, { status: 201 })
    }))
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Add category' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Add category' }))
    await userEvent.type(sheet.getByLabelText('Name'), 'Insurance')
    await userEvent.type(sheet.getByLabelText('Budget'), '75')
    await userEvent.click(sheet.getByRole('radio', { name: 'In one go' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Mark as paid when a new cycle starts' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(body).toMatchObject({ type: 'Debit', name: 'Insurance', budgetAmount: 75, spreadEvenly: false, autoPay: true }))
    // New, so it has no transactions: asked straight away, without reading the list.
    expect(await screen.findByRole('dialog', { name: 'Mark Insurance as paid for this cycle too?' })).toBeInTheDocument()
  })

  test('removing asks first, then deletes; a refusal is shown in the server\'s words', async () => {
    server.use(http.delete('/api/cycles/cur/categories/food', () => HttpResponse.json({ status: 422, code: 'category.has-transactions', detail: 'Remove its transactions in this cycle first.' }, { status: 422 })))
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Groceries' }))
    const confirm = within(await screen.findByRole('dialog', { name: 'Remove Groceries?' }))
    await userEvent.click(confirm.getByRole('button', { name: 'Remove' }))

    // The dialog stays open with the reason, so the person sees why nothing went.
    expect(await confirm.findByRole('alert')).toHaveTextContent('Remove its transactions in this cycle first.')
    expect(screen.getByRole('heading', { level: 3, name: 'Groceries' })).toBeInTheDocument()
  })

  test('offline, both are disabled and the reason is on screen, not hidden', async () => {
    await renderScreen()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))

    expect(screen.getByRole('button', { name: 'Add category' })).toBeDisabled()
    expect(screen.getByText('Adding or removing a category needs a connection.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Groceries' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Favourite Groceries' })).toBeEnabled()
    const sheet = await openEdit('Groceries')
    expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

describe('favourites are pinned by hand from the list, per device', () => {
  test('a category is pinned and unpinned from its row, and the pin is kept on the device', async () => {
    await renderScreen({ online: false })
    const pin = screen.getByRole('button', { name: 'Favourite Groceries' })
    expect(pin).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(pin)
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('budget.favouriteCategories')!)).toEqual(['food'])

    await userEvent.click(pin)
    expect(pin).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(localStorage.getItem('budget.favouriteCategories')!)).toEqual([])
  })

  test('a pinned category shows as pinned', async () => {
    localStorage.setItem('budget.favouriteCategories', JSON.stringify(['rent']))
    await renderScreen({ online: false })

    expect(screen.getByRole('button', { name: 'Favourite Rent' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('pinning is a device setting: it needs no connection and queues nothing for the server', async () => {
    await renderScreen({ online: false })

    await userEvent.click(screen.getByRole('button', { name: 'Favourite Rent' }))

    expect(await queued()).toEqual([])
  })

  test('the sheet no longer carries favourite or remove', async () => {
    await renderScreen()
    const sheet = await openEdit('Groceries')

    expect(sheet.queryByRole('button', { name: /Favourite|Remove/ })).not.toBeInTheDocument()
  })
})

describe('the sheet asks how it is spent first', () => {
  test('"How is it spent?" and auto-pay come before the name', async () => {
    await renderScreen()
    const sheet = await openEdit('Rent')
    await userEvent.click(sheet.getByRole('radio', { name: 'In one go' }))

    const name = sheet.getByLabelText('Name')
    for (const before of [sheet.getByRole('radiogroup', { name: 'How is it spent?' }), sheet.getByRole('button', { name: 'Mark as paid when a new cycle starts' })]) {
      expect(before.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
