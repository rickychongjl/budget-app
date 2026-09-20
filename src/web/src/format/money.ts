// MASTER section 11. The one money formatter: every amount on screen goes through here (and wears the .num class).
const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: string) {
  let format = formatters.get(currency)
  if (!format) {
    format = new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    formatters.set(currency, format)
  }
  return format
}

// sign: prefix a positive amount with "+", for income in a list that mixes both directions.
export function formatMoney(amount: number, currency: string, { sign = false } = {}) {
  // Rounded first so that -0.001 is "$0.00", not "−$0.00".
  const cents = Math.round(amount * 100)
  const text = formatter(currency).format(Math.abs(cents) / 100)
  // U+2212, a true minus: a hyphen is narrower and does not line up with "+" in a column.
  return cents < 0 ? `−${text}` : sign && cents > 0 ? `+${text}` : text
}

// What someone typed into a money field, as a number, or null when it is not an amount. Forgiving about how it is
// written ("$3,620.25", a true minus sign) and strict about what it is: at most two decimal places, because a third
// would be silently rounded by decimal(18,2).
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[\s,$]/g, '').replace('−', '-')
  return /^-?(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned) ? Number(cleaned) : null
}
