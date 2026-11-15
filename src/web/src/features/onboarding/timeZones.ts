export type ZoneOption = { value: string; label: string }

// Where nearly every user lives, west to east, named the way people say them. The odd ones (Eucla, Broken Hill,
// Lindeman) are still in the full list.
export const AUSTRALIAN_ZONES: ZoneOption[] = [
  { value: 'Australia/Perth', label: 'Perth, Western Australia' },
  { value: 'Australia/Darwin', label: 'Darwin, Northern Territory' },
  { value: 'Australia/Adelaide', label: 'Adelaide, South Australia' },
  { value: 'Australia/Brisbane', label: 'Brisbane, Queensland' },
  { value: 'Australia/Sydney', label: 'Sydney, New South Wales and ACT' },
  { value: 'Australia/Melbourne', label: 'Melbourne, Victoria' },
  { value: 'Australia/Hobart', label: 'Hobart, Tasmania' },
  { value: 'Australia/Lord_Howe', label: 'Lord Howe Island' },
]

// The IANA zone this device is set to. Used once, as the first-run suggestion: after that "today" is always the saved
// zone (todayIn(me.timeZone)), never the device's.
export function detectTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && zone !== 'Etc/Unknown' ? zone : undefined
  } catch {
    return undefined
  }
}

// Every zone the browser knows (about 400), plus any extra it does not list, such as an older name a device reports or
// the one already saved, so the select can always show the value it holds.
export function otherZones(extra: string[]): ZoneOption[] {
  const australian = new Set(AUSTRALIAN_ZONES.map((zone) => zone.value))
  return [...new Set([...supported(), ...extra])]
    .filter((zone) => !australian.has(zone))
    .sort()
    .map((value) => ({ value, label: value.replaceAll('_', ' ') }))
}

function supported(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}
