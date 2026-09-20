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
