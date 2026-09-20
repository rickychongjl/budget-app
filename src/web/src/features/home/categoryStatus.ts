import type { CategoryRollup } from '../../api/types'
import { formatMoney } from '../../format/money'

export type CategoryStatus = {
  // Picks the bar fill and the text colour. The bar shows status, never the category's own colour.
  tone: 'normal' | 'warning' | 'negative' | 'positive'
  // A Lucide name, or nothing when the status is Normal. Status is always colour plus icon plus word.
  icon?: 'triangle-alert' | 'circle-alert' | 'check' | 'trending-up'
  word: string
}

// At 80% of a spending limit the bar turns amber. Presentation only: it is not a rule the server knows about.
const WARNING_AT = 80

// MASTER 3.3, row for row. Whether a category is Over or Ahead is the API's call (CycleRollup.Line); this only decides
// how to show it, plus the two things the API has no word for: "nearly there" and "received exactly".
export function categoryStatus(row: CategoryRollup, currency: string): CategoryStatus {
  const money = (amount: number) => formatMoney(amount, currency)

  if (row.type === 'Debit') {
    if (row.status === 'Over') {
      return { tone: 'negative', icon: 'circle-alert', word: `Over by ${money(-row.remaining)}` }
    }
    const word = `${money(row.remaining)} left`
    return row.percentUsed !== null && row.percentUsed >= WARNING_AT ? { tone: 'warning', icon: 'triangle-alert', word } : { tone: 'normal', word }
  }

  if (row.status === 'Ahead') {
    return { tone: 'positive', icon: 'trending-up', word: `Ahead by ${money(-row.remaining)}` }
  }
  return row.budgeted > 0 && row.remaining === 0 ? { tone: 'positive', icon: 'check', word: 'Received' } : { tone: 'normal', word: `${money(row.remaining)} to go` }
}
