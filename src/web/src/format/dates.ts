// MASTER section 11. A date is a "YYYY-MM-DD" string from the API to the screen and is never handed to `new Date(string)`:
// that parses as UTC midnight and then prints in the device's zone, which is yesterday for half the world.
// Arithmetic goes through Date.UTC, where every day is 24 hours and daylight saving does not exist.

// Not Intl: en-AU's short September is "Sept" in current ICU data and has changed between versions. MASTER says "1 Sep".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000

const parts = (date: string) => date.split('-').map(Number) as [number, number, number]
const toUtc = (date: string) => {
  const [year, month, day] = parts(date)
  return Date.UTC(year, month - 1, day)
}

// Whole days from a date, through UTC so that daylight saving cannot lose or gain one. A cycle ends addDays(start, 29).
export const addDays = (date: string, days: number) => new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10)

// "1 Sep" inside today's year, "1 Sep 2025" otherwise.
export function formatDate(date: string, today: string) {
  const [year, month, day] = parts(date)
  const text = `${day} ${MONTHS[month - 1]}`
  return year === parts(today)[0] ? text : `${text} ${year}`
}

export const formatRange = (start: string, end: string, today: string) => `${formatDate(start, today)} to ${formatDate(end, today)}`

// "day 12 of 30". Held inside the cycle, so a stale cached cycle never reads "day 34 of 30".
export function cycleDay(start: string, end: string, today: string) {
  const length = (toUtc(end) - toUtc(start)) / DAY_MS + 1
  const day = (toUtc(today) - toUtc(start)) / DAY_MS + 1
  return { day: Math.min(Math.max(day, 1), length), length }
}

// How much of the cycle is gone by the end of today, 0 to 1: where the "today" line sits on a category's bar, so a
// spend that has run ahead of the line has run ahead of the calendar.
export function cycleElapsed(start: string, end: string, today: string) {
  const { day, length } = cycleDay(start, end, today)
  return day / length
}

// Today where the user lives (User.TimeZone from /api/me), which is how the server decides the current cycle.
// The device's own zone is the wrong answer on a trip, and UTC is the wrong answer every morning in Sydney.
export function todayIn(timeZone: string, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  const format = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  try {
    return format(timeZone)
  } catch {
    return format('UTC')
  }
}
