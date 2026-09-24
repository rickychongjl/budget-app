import { describe, expect, test } from 'vitest'
import { cycleDay, cycleElapsed, formatDate, formatRange, todayIn } from './dates'
import { formatMoney } from './money'

// MASTER section 11.
describe('formatMoney', () => {
  test.each([
    [0, '$0.00'],
    [5, '$5.00'],
    [1234.5, '$1,234.50'],
    [0.1 + 0.2, '$0.30'],
    [1_000_000, '$1,000,000.00'],
  ])('%s is %s: always two decimals', (amount, expected) => {
    expect(formatMoney(amount, 'AUD')).toBe(expected)
  })

  test('a negative uses a true minus sign, never a hyphen or brackets', () => {
    expect(formatMoney(-20, 'AUD')).toBe('−$20.00')
    expect(formatMoney(-20, 'AUD')).not.toContain('-')
  })

  test('income in a mixed list is prefixed with a plus', () => {
    expect(formatMoney(20, 'AUD', { sign: true })).toBe('+$20.00')
    expect(formatMoney(-20, 'AUD', { sign: true })).toBe('−$20.00')
    expect(formatMoney(0, 'AUD', { sign: true })).toBe('$0.00')
  })

  test("uses the user's currency", () => {
    expect(formatMoney(5, 'NZD')).toContain('5.00')
    expect(formatMoney(5, 'NZD')).not.toBe('$5.00')
  })
})

describe('formatDate', () => {
  const today = '2026-09-20'

  test.each([
    ['2026-09-01', '1 Sep'],
    ['2026-01-31', '31 Jan'],
    ['2026-12-05', '5 Dec'],
    ['2025-09-01', '1 Sep 2025'],
    ['2027-01-03', '3 Jan 2027'],
  ])('%s reads "%s": the year only when it is not this year', (date, expected) => {
    expect(formatDate(date, today)).toBe(expected)
  })

  // Intl's en-AU short month is "Sept" in current ICU data, and it has changed before. MASTER says "1 Sep".
  test('months are three letters, whatever the runtime thinks', () => {
    const months = Array.from({ length: 12 }, (_, month) => formatDate(`2026-${String(month + 1).padStart(2, '0')}-01`, today))

    expect(months).toEqual(['1 Jan', '1 Feb', '1 Mar', '1 Apr', '1 May', '1 Jun', '1 Jul', '1 Aug', '1 Sep', '1 Oct', '1 Nov', '1 Dec'])
  })
})

describe('formatRange', () => {
  test('a cycle inside this year', () => {
    expect(formatRange('2026-09-01', '2026-09-30', '2026-09-20')).toBe('1 Sep to 30 Sep')
  })

  test('a cycle that crosses the new year says the year where it differs', () => {
    expect(formatRange('2026-12-15', '2027-01-13', '2026-12-20')).toBe('15 Dec to 13 Jan 2027')
  })
})

describe('cycleDay', () => {
  test.each([
    ['2026-09-01', { day: 1, length: 30 }],
    ['2026-09-12', { day: 12, length: 30 }],
    ['2026-09-30', { day: 30, length: 30 }],
  ])('on %s', (today, expected) => {
    expect(cycleDay('2026-09-01', '2026-09-30', today)).toEqual(expected)
  })

  test('counts across a month end and a daylight-saving change', () => {
    // Sydney's clocks go forward on 4 Oct 2026; a day is still a day.
    expect(cycleDay('2026-09-20', '2026-10-19', '2026-10-05')).toEqual({ day: 16, length: 30 })
  })

  test('stays inside the cycle when today is outside it', () => {
    expect(cycleDay('2026-09-01', '2026-09-30', '2026-08-15').day).toBe(1)
    expect(cycleDay('2026-09-01', '2026-09-30', '2026-10-15').day).toBe(30)
  })
})

describe('cycleElapsed', () => {
  test.each([
    ['2026-09-01', 1 / 30],
    ['2026-09-15', 0.5],
    ['2026-09-30', 1],
  ])('on %s', (today, expected) => {
    expect(cycleElapsed('2026-09-01', '2026-09-30', today)).toBeCloseTo(expected)
  })

  test('stays on the bar when today is outside the cycle', () => {
    expect(cycleElapsed('2026-09-01', '2026-09-30', '2026-08-15')).toBeCloseTo(1 / 30)
    expect(cycleElapsed('2026-09-01', '2026-09-30', '2026-10-15')).toBe(1)
  })
})

describe('todayIn', () => {
  // 20 Sep 2026 21:30 UTC is already the 21st in Sydney and still the 20th in Los Angeles.
  const now = new Date('2026-09-20T21:30:00Z')

  test.each([
    ['Australia/Sydney', '2026-09-21'],
    ['UTC', '2026-09-20'],
    ['America/Los_Angeles', '2026-09-20'],
  ])("%s: the user's date, not the device's or UTC's", (timeZone, expected) => {
    expect(todayIn(timeZone, now)).toBe(expected)
  })

  test('an unknown time zone falls back to UTC rather than throwing', () => {
    expect(todayIn('Mars/Olympus', now)).toBe('2026-09-20')
  })
})
