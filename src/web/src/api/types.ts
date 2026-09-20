// Hand-copied from the records in src/Budget.Application (and CycleRollup in Budget.Domain).
// ponytail: about ten types, so no generator. If the API grows or these drift, add OpenAPI output to Budget.Api and
// generate this file with openapi-typescript in the build. The M8 Playwright specs are what catch a drift until then.
// Wire format: camelCase, enums as their names, decimals as JSON numbers, DateOnly as "YYYY-MM-DD", Guid as a string.

export type CategoryType = 'Debit' | 'Credit'
export type CycleStatus = 'Draft' | 'Confirmed'
export type CyclePhase = 'Past' | 'Current' | 'Future'
export type RollupStatus = 'OnTrack' | 'Over' | 'Ahead'

// MeDto
export type Me = {
  id: string
  displayName: string
  timeZone: string
  currency: string
  isDemo: boolean
  cycleLengthDays: number
}

// GET /auth/options
export type SignInMethod = 'demo' | 'entra'
export type AuthOptions = { signIn: SignInMethod[] }

// CycleDto
export type Cycle = {
  id: string
  startDate: string
  endDate: string
  status: CycleStatus
  phase: CyclePhase
  openingBalance: number | null
  closingBalance: number | null
}

// CategoryRollup. percentUsed is unrounded, and null when nothing was budgeted.
export type CategoryRollup = {
  categoryId: string
  name: string
  icon: string
  colour: string
  type: CategoryType
  budgeted: number
  actual: number
  remaining: number
  percentUsed: number | null
  status: RollupStatus
}

// CycleRollup. accrued is closing minus opening, and null until both are known.
export type CycleRollup = {
  categories: CategoryRollup[]
  debitsBudgeted: number
  debitsActual: number
  creditsBudgeted: number
  creditsActual: number
  net: number
  accrued: number | null
}

// CycleSummaryDto: GET /api/cycles/current and /api/cycles/{id}
export type CycleSummary = { cycle: Cycle; rollup: CycleRollup }
