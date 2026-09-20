import type { TrendCategory, TrendFilter } from './trend'

// Which series the trend chart shows is a per-device convenience, like the theme, so it lives in localStorage and
// never reaches the server.
const KEY = 'budget.chartFilter'

export const SPENDING: TrendFilter = { kind: 'spending' }

// A category that has since been removed would draw an empty chart, so it falls back to total spending.
export function readFilter(categories: TrendCategory[]): TrendFilter {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (stored && typeof stored === 'object' && 'kind' in stored) {
      const filter = stored as TrendFilter
      if (filter.kind === 'spending' || filter.kind === 'accrued') {
        return filter
      }
      const category = categories.find((one) => one.id === filter.categoryId)
      if (category) {
        return { kind: 'category', categoryId: category.id, name: category.name }
      }
    }
  } catch {
    // Private mode, blocked storage, or something else wrote nonsense there: the chart still draws.
  }
  return SPENDING
}

export function writeFilter(filter: TrendFilter) {
  try {
    // The name is a label for the sentence, not part of the choice; it is looked up again on the next load.
    localStorage.setItem(KEY, JSON.stringify(filter.kind === 'category' ? { kind: 'category', categoryId: filter.categoryId } : filter))
  } catch {
    // See readFilter: forgetting the choice is the only cost.
  }
}
