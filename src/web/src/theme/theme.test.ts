import { beforeEach, describe, expect, test, vi } from 'vitest'
import { setSystemDark } from '../test/setup'
import { applyTheme, getPreference, setPreference, watchSystem } from './theme'

const root = document.documentElement
const themeColour = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

beforeEach(() => {
  localStorage.clear()
  setSystemDark(false)
  root.removeAttribute('data-theme')
  document.head.querySelector('meta[name="theme-color"]')?.remove()
})

describe('preference', () => {
  test('defaults to system', () => {
    expect(getPreference()).toBe('system')
  })

  test('is remembered under budget.theme', () => {
    setPreference('dark')

    expect(localStorage.getItem('budget.theme')).toBe('dark')
    expect(getPreference()).toBe('dark')
  })

  test('an unknown stored value falls back to system', () => {
    localStorage.setItem('budget.theme', 'sepia')

    expect(getPreference()).toBe('system')
  })

  test('storage that throws (private mode) reads as system and still applies the choice', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(getPreference()).toBe('system')
    expect(() => setPreference('dark')).not.toThrow()
    expect(root.dataset.theme).toBe('dark')
  })
})

describe('applyTheme', () => {
  test.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('%s with system dark=%s resolves to %s', (preference, systemDark, expected) => {
    setSystemDark(systemDark)

    applyTheme(preference)

    expect(root.dataset.theme).toBe(expected)
    expect(root.style.colorScheme).toBe(expected)
  })

  test('keeps the status bar colour in step with the background', () => {
    applyTheme('light')
    expect(themeColour()).toBe('#F8FAFC')

    applyTheme('dark')
    expect(themeColour()).toBe('#0F172A')
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
  })
})

describe('watchSystem', () => {
  test('follows the system live while the preference is system', () => {
    applyTheme('system')
    const stop = watchSystem()

    setSystemDark(true)
    expect(root.dataset.theme).toBe('dark')

    stop()
    setSystemDark(false)
    expect(root.dataset.theme).toBe('dark')
  })

  test('ignores the system once the user has chosen', () => {
    setPreference('light')
    const stop = watchSystem()

    setSystemDark(true)

    expect(root.dataset.theme).toBe('light')
    stop()
  })
})
