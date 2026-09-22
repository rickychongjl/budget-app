import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// What the demo is reset to before a run (global-setup.ts), so a spec can derive a count instead of pinning one.
export const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/demo-seed.json', import.meta.url)), 'utf8')) as {
  firstCycleStartOffset: number
  openingBalance: number
  closingBalances: number[]
  categories: { key: string; type: 'Debit' | 'Credit'; name: string; budget: number }[]
  transactions: { category: string; dayOffset: number; amount: number; note: string | null }[]
}
// Integer division, as ResetDemoTests has it: 130 days back is four finished cycles and the current one.
export const cycleCount = Math.floor(-fixture.firstCycleStartOffset / 30) + 1

// The demo user's today, in Sydney: the API decides "today" in the user's zone and the specs have to agree.
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// The current cycle's first day, as an offset from today: the fixture's first start plus the cycles since.
export const currentCycleStartOffset = fixture.firstCycleStartOffset + 30 * (cycleCount - 1)

// What the fixture put in one category of the current cycle: the numbers a spec starts from.
export function fixtureSpent(categoryKey: string) {
  return fixture.transactions.filter((t) => t.category === categoryKey && t.dayOffset >= currentCycleStartOffset).reduce((sum, t) => sum + t.amount, 0)
}

export const money = (amount: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)

// A category row on Home or on a cycle's page: the whole row is one link.
export const categoryRow = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(name) })

type NewTransaction = { type?: 'Spending' | 'Income'; amount: string; category: string; note?: string }

// Through the Add tab, the way a person does it: the keypad, the search, the category, Save.
export async function addTransaction(page: Page, { type = 'Spending', amount, category, note }: NewTransaction) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Add' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add transaction' })
  await expect(sheet).toBeVisible()
  if (type === 'Income') {
    await sheet.getByRole('radio', { name: 'Income' }).click()
  }
  for (const key of amount) {
    await sheet.getByRole('button', { name: key === '.' ? 'Decimal point' : key, exact: true }).click()
  }
  await sheet.getByRole('searchbox', { name: 'Search categories' }).fill(category)
  await sheet.getByRole('radio', { name: category }).click()
  if (note) {
    await sheet.getByRole('button', { name: 'Add note' }).click()
    await sheet.getByLabel('Note').fill(note)
  }
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
}
