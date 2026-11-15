import { expect, test, vi } from 'vitest'
import { AUSTRALIAN_ZONES, detectTimeZone, otherZones } from './timeZones'

const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
function deviceZone(zone: string | undefined) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: zone as string }
  })
}

test('the device zone is what the browser reports', () => {
  deviceZone('Australia/Perth')

  expect(detectTimeZone()).toBe('Australia/Perth')
})

test.each([[undefined], [''], ['Etc/Unknown']])('a device that cannot say (%j) gives no zone', (zone) => {
  deviceZone(zone)

  expect(detectTimeZone()).toBeUndefined()
})

test('the Australian zones are the mainland and island zones people live in, west to east', () => {
  expect(AUSTRALIAN_ZONES.map((zone) => zone.value)).toEqual([
    'Australia/Perth',
    'Australia/Darwin',
    'Australia/Adelaide',
    'Australia/Brisbane',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Hobart',
    'Australia/Lord_Howe',
  ])
  // Every one is a zone this platform knows, the same check the server makes with TimeZoneInfo.
  for (const { value } of AUSTRALIAN_ZONES) {
    expect(() => new Intl.DateTimeFormat('en-AU', { timeZone: value })).not.toThrow()
  }
})

test('the rest of the world is every zone the browser knows, sorted, without repeating the Australian ones', () => {
  const zones = otherZones([])
  const values = zones.map((zone) => zone.value)

  expect(values).toContain('Europe/London')
  expect(values).toContain('Australia/Eucla')
  expect(values).not.toContain('Australia/Perth')
  expect(values).toEqual([...values].sort())
  expect(zones.find((zone) => zone.value === 'America/New_York')?.label).toBe('America/New York')
})

test('a zone the browser does not list (an older name, or the saved one) is still offered, once', () => {
  vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Kolkata', 'Europe/London'])

  expect(otherZones(['Asia/Calcutta', 'Europe/London', 'Australia/Sydney']).map((zone) => zone.value)).toEqual(['Asia/Calcutta', 'Asia/Kolkata', 'Europe/London'])
})

test('a browser without the list still offers the extras', () => {
  vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
    throw new TypeError('not supported')
  })

  expect(otherZones(['UTC']).map((zone) => zone.value)).toEqual(['UTC'])
})
