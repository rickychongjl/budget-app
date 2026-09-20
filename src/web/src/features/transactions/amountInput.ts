// The amount while it is being typed, as text: "12." and "12.50" are different things to show and the same number.
// Pure, so the rules are a table in the tests.

// Nine whole digits is more than any budget here, and keeps the value inside what a JS number holds to the cent.
const MAX_WHOLE_DIGITS = 9

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back'

export function press(text: string, key: string): string {
  if (key === 'back') {
    return text.slice(0, -1)
  }
  if (key === '.') {
    return text.includes('.') ? text : `${text || '0'}.`
  }
  if (!/^\d$/.test(key)) {
    return text
  }

  const [whole, decimals] = text.split('.')
  if (decimals !== undefined) {
    // Money is decimal(18,2): a third decimal place is ignored rather than rounded behind the user's back.
    return decimals.length < 2 ? text + key : text
  }
  if (whole === '0' || whole === '') {
    return key
  }
  return whole.length < MAX_WHOLE_DIGITS ? text + key : text
}

export const amountOf = (text: string) => Number(text) || 0

// From a saved amount back to keypad text, for editing: 12.5 is "12.5", 12 is "12".
export const textOf = (amount: number) => String(Math.round(amount * 100) / 100)
