// Hand-copied from the records in src/Budget.Application (and CycleRollup in Budget.Domain).
// ponytail: about ten types, so no generator. If the API grows or these drift, add OpenAPI output to Budget.Api and
// generate this file with openapi-typescript in the build. The M8 Playwright specs are what catch a drift until then.
// Wire format: camelCase, enums as their names, decimals as JSON numbers, DateOnly as "YYYY-MM-DD", Guid as a string.

export type CategoryType = 'Debit' | 'Credit'
export type CycleStatus = 'Draft' | 'Confirmed'
export type CyclePhase = 'Past' | 'Current' | 'Future'
export type RollupStatus = 'OnTrack' | 'Over' | 'Ahead'

// PlanLimits (Budget.Domain/Subscriptions/Plans.cs). null means no limit.
export type PlanLimits = { maxCategoriesPerCycle: number | null; pastCyclesInReports: number | null; trendChart: boolean }
export type PlanName = 'free' | 'premium'
// Why the plan is Premium; null on Free.
export type PremiumSource = 'demo' | 'complimentary' | 'subscription'

// MeDto. The plan fields are optional only because an answer the service worker cached before plans existed has none;
// features/plans/plan.ts reads them so that a missing answer locks nothing (the server still enforces the plan).
export type Me = {
  id: string
  displayName: string
  timeZone: string
  currency: string
  isDemo: boolean
  cycleLengthDays: number
  plan?: PlanName
  planSource?: PremiumSource | null
  limits?: PlanLimits
}

// PlanCatalogueDto: GET /api/plans, public. Prices are for display; the stores charge.
export type PlanCatalogue = {
  free: PlanLimits
  premium: PlanLimits
  premiumPrice: { currency: string; monthly: number; yearly: number; trialDays: number }
}

// GET /auth/options
export type SignInMethod = 'demo' | 'google'
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
  // Spent a little at a time, so Home can say when spending runs ahead of the calendar. False for a bill paid in one go.
  spreadEvenly: boolean
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

// TransactionDto. clientId is the idempotency key the client made up; id is the server's.
export type Transaction = {
  id: string
  clientId: string
  cycleId: string
  categoryId: string
  amount: number
  occurredOn: string
  note: string | null
  createdAt: string
  updatedAt: string
}

export type CreateTransactionRequest = Pick<Transaction, 'clientId' | 'cycleId' | 'categoryId' | 'amount' | 'occurredOn' | 'note'>
export type EditTransactionRequest = Partial<Pick<Transaction, 'categoryId' | 'amount' | 'occurredOn' | 'note'>>
export type EditCategoryRequest = Partial<{ name: string; icon: string; colour: string; sortOrder: number; budgetAmount: number; spreadEvenly: boolean }>

// TransactionResult / TransactionDeleted. requiresClosingBalanceReview: the write landed in a past cycle, so the UI
// offers to update that cycle's closing balance. It comes from the server and is never guessed here.
export type TransactionResult = { transaction: Transaction; requiresClosingBalanceReview: boolean; created: boolean }
export type TransactionDeleted = { requiresClosingBalanceReview: boolean }

// SyncItem: one queued offline change, in exactly the shape POST /api/sync takes. A transaction is named by clientId,
// not id: one created offline has no server id until its create has synced.
export type SyncItem =
  | { type: 'transaction.create'; create: CreateTransactionRequest }
  | { type: 'transaction.edit'; clientId: string; edit: EditTransactionRequest }
  | { type: 'transaction.delete'; clientId: string }
  | { type: 'category.edit'; cycleId: string; categoryId: string; category: EditCategoryRequest }

// SyncItemResult, one per item, in order. A refusal has code and detail and would be refused again if resent.
export type SyncItemResult = { index: number; ok: boolean; result?: unknown; code?: string; detail?: string }
