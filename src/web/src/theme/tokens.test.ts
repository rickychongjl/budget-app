import { expect, test } from 'vitest'
import tokens from './tokens.css?raw'

// Every stylesheet in src, as text. tokens.css is the one place a raw colour is allowed.
const stylesheets = Object.entries(import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })).filter(
  ([file]) => !file.endsWith('tokens.css'),
)

test('there are stylesheets to check', () => {
  expect(stylesheets.length).toBeGreaterThan(5)
})

// CLAUDE.md hard rule: semantic tokens only. A colour written into a component is right in one theme at best.
test.each(stylesheets)('%s uses tokens, not raw colours', (_, source) => {
  // An unprocessed stylesheet arrives empty under Vitest, which would pass this check while checking nothing.
  expect(source).toContain('{')
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '')

  expect(css.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) ?? []).toEqual([])
})

// A token missing from one theme renders as nothing there, which no other test would notice.
test('light and dark define exactly the same tokens', () => {
  const names = (theme: string) => {
    const block = tokens.slice(tokens.indexOf(`[data-theme='${theme}']`))
    return [...block.slice(0, block.indexOf('}')).matchAll(/(--[\w-]+):/g)].map((match) => match[1]).sort()
  }

  expect(names('light').length).toBeGreaterThan(30)
  expect(names('dark')).toEqual(names('light'))
})
