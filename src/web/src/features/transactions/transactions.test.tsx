import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { CategoryRollup, CycleSummary, Me } from '../../api/types'
import { db } from '../../offline/db'
import { configureOutbox, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext } from '../auth/useSession'
import { AddTransactionSheet } from './AddTransactionSheet'
import { amountOf, press } from './amountInput'

describe('keypad', () => {
  const type = (keys: string) => [...keys].reduce((text, key) => press(text, key === '<' ? 'back' : key), '')

  test.each([
    ['5', '5', 5],
    ['12.5', '12.5', 12.5],
    ['12.50', '12.50', 12.5],
    // A leading zero is replaced, not kept.
    ['05', '5', 5],
    ['0.5', '0.5', 0.5],
    // A bare point starts "0.".
    ['.5', '0.5', 0.5],
    // Only one point, only two decimal places.
    ['1.2.3', '1.23', 1.23],
    ['1.239', '1.23', 1.23],
    // Backspace, including past the start.
    ['12<', '1', 1],
    ['1.<', '1', 1],
    ['1<<<', '', 0],
    // Nine whole digits: enough for any budget, and safely inside what a JS number holds exactly.
    ['1234567890', '123456789', 123456789],
  ])('typing %s shows "%s"', (keys, text, amount) => {
    expect(type(keys)).toBe(text)
    expect(amountOf(type(keys))).toBe(amount)
  })
})

const ME: Me = { id: 'u1', displayName: 'Demo', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: true, cycleLengthDays: 30 }

const row = (categoryId: string, name: string, type: 'Debit' | 'Credit'): CategoryRollup => ({
  categoryId, name, icon: 'tag', colour: 'blue', type, budgeted: 100, actual: 0, remaining: 100, percentUsed: 0, status: 'OnTrack', spreadEvenly: true,
})

const SUMMARY: CycleSummary = {
  cycle: { id: 'c1', startDate: '2026-09-10', endDate: '2026-10-09', status: 'Confirmed', phase: 'Current', openingBalance: 0, closingBalance: null },
  rollup: {
    categories: [row('pay', 'Salary', 'Credit'), row('rent', 'Rent', 'Debit'), row('food', 'Groceries', 'Debit'), row('fun', 'Fun', 'Debit')],
    debitsBudgeted: 300, debitsActual: 0, creditsBudgeted: 100, creditsActual: 0, net: 0, accrued: null,
  },
}

function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <AddTransactionSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

async function renderSheet(summary: CycleSummary | null = SUMMARY) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  server.use(http.get('/api/cycles/current', () => (summary ? HttpResponse.json(summary) : HttpResponse.json({ status: 404, code: 'cycle.none' }, { status: 404 }))))
  await configureOutbox({ userId: 'u1', refresh: async () => undefined })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionContext value={{ me: ME, signOut: async () => undefined }}>
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
  const sheet = within(await screen.findByRole('dialog', { name: 'Add transaction' }))
  if (summary?.cycle.status === 'Confirmed') {
    // The form replaces the loading state once the cycle is known.
    await sheet.findByRole('button', { name: 'Save' })
  }
  return sheet
}

const queued = async () => (await db.outbox.orderBy('seq').toArray()).map((entry) => entry.item)
const tap = async (sheet: ReturnType<typeof within>, keys: string) => {
  for (const key of keys) {
    await userEvent.click(sheet.getByRole('button', { name: key === '.' ? 'Decimal point' : key }))
  }
}

beforeEach(async () => {
  stopOutbox()
  localStorage.clear()
  await db.outbox.clear()
  await db.cache.clear()
})

describe('AddTransactionSheet', () => {
  test('the amount is typed on the app\'s own keypad and shown as money', async () => {
    const sheet = await renderSheet()
    await sheet.findByRole('radio', { name: 'Groceries' })

    await tap(sheet, '12.5')

    expect(sheet.getByLabelText('Amount')).toHaveTextContent('$12.5')
    await userEvent.click(sheet.getByRole('button', { name: 'Backspace' }))
    expect(sheet.getByLabelText('Amount')).toHaveTextContent('$12.')
  })

  test('Spending lists debit categories, Income lists credit ones', async () => {
    const sheet = await renderSheet()

    expect((await sheet.findAllByRole('radio', { name: /Rent|Groceries|Fun|Salary/ })).map((r) => r.closest('label')!.textContent)).toEqual(['Rent', 'Groceries', 'Fun'])

    await userEvent.click(sheet.getByRole('radio', { name: 'Income' }))

    expect(sheet.getByRole('radio', { name: 'Salary' })).toBeInTheDocument()
    expect(sheet.queryByRole('radio', { name: 'Rent' })).not.toBeInTheDocument()
  })

  test('search narrows the list, and says so when nothing matches', async () => {
    const sheet = await renderSheet()
    await sheet.findByRole('radio', { name: 'Groceries' })

    await userEvent.type(sheet.getByRole('searchbox', { name: 'Search categories' }), 'gro')
    expect(sheet.getByRole('radio', { name: 'Groceries' })).toBeInTheDocument()
    expect(sheet.queryByRole('radio', { name: 'Rent' })).not.toBeInTheDocument()

    await userEvent.type(sheet.getByRole('searchbox', { name: 'Search categories' }), 'xyz')
    expect(sheet.getByText('No category matches "groxyz".')).toBeInTheDocument()
  })

  test('Save needs an amount and a category', async () => {
    const sheet = await renderSheet()
    await sheet.findByRole('radio', { name: 'Groceries' })
    const save = sheet.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    await tap(sheet, '5')
    expect(save).toBeDisabled()

    await userEvent.click(sheet.getByRole('radio', { name: 'Groceries' }))
    expect(save).toBeEnabled()

    await userEvent.click(sheet.getByRole('button', { name: 'Backspace' }))
    expect(save).toBeDisabled()
  })

  test('saving queues a create for the current cycle, dated today where the user lives, then closes and says Saved', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 21:30 UTC on the 20th is already the 21st in Sydney.
    vi.setSystemTime(new Date('2026-09-20T21:30:00Z'))
    const sheet = await renderSheet()
    await tap(sheet, '42.9')
    await userEvent.click(await sheet.findByRole('radio', { name: 'Groceries' }))

    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    const [item] = await queued()
    expect(item).toMatchObject({ type: 'transaction.create', create: { cycleId: 'c1', categoryId: 'food', amount: 42.9, occurredOn: '2026-09-21', note: null } })
    expect(item.type === 'transaction.create' && item.create.clientId).toMatch(/^[0-9a-f-]{36}$/)
    vi.useRealTimers()
  })

  test('the date can be changed and a note added; the note is collapsed until asked for', async () => {
    const sheet = await renderSheet()
    await tap(sheet, '8')
    await userEvent.click(await sheet.findByRole('radio', { name: 'Fun' }))
    const addNote = sheet.getByRole('button', { name: 'Add note' })
    expect(addNote).toHaveAttribute('aria-expanded', 'false')
    expect(sheet.queryByLabelText('Note')).not.toBeInTheDocument()

    await userEvent.click(addNote)
    await userEvent.type(sheet.getByLabelText('Note'), '  Cinema  ')
    await userEvent.clear(sheet.getByLabelText('Date'))
    await userEvent.type(sheet.getByLabelText('Date'), '2026-09-15')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await queued()).toHaveLength(1))
    expect((await queued())[0]).toMatchObject({ create: { occurredOn: '2026-09-15', note: 'Cinema', categoryId: 'fun' } })
  })

  test('Undo on the toast takes it back out', async () => {
    const sheet = await renderSheet()
    await tap(sheet, '5')
    await userEvent.click(await sheet.findByRole('radio', { name: 'Rent' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await queued()).toHaveLength(1))

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    // Not yet sent, so the create and its delete cancel out and nothing reaches the server.
    await waitFor(async () => expect(await queued()).toEqual([]))
  })

  test('the category used last is listed first next time, per type', async () => {
    const sheet = await renderSheet()
    await tap(sheet, '5')
    await userEvent.click(await sheet.findByRole('radio', { name: 'Fun' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'reopen' }))
    const again = within(await screen.findByRole('dialog', { name: 'Add transaction' }))

    const names = (await again.findAllByRole('radio', { name: /Rent|Groceries|Fun/ })).map((r) => r.closest('label')!.textContent)
    expect(names).toEqual(['Fun', 'Rent', 'Groceries'])
    // A fresh sheet: nothing carried over from the last entry.
    expect(again.getByLabelText('Amount')).toHaveTextContent('$0')
    expect(again.getByRole('radio', { name: 'Fun' })).not.toBeChecked()
  })

  test.each([
    ['there is no cycle', null],
    ['the first cycle is not confirmed', { ...SUMMARY, cycle: { ...SUMMARY.cycle, status: 'Draft' as const } }],
  ])('when %s it explains why nothing can be added', async (_, summary) => {
    const sheet = await renderSheet(summary)

    expect(await sheet.findByText('Confirm your budget before adding transactions.')).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
