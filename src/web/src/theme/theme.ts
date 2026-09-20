// MASTER section 2. The preference is a per-device convenience, so it lives in localStorage and never reaches the server.
// index.html carries an inline copy of the resolve step so the right theme is set before first paint; keep the two in step.
export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'budget.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
// The phone's status bar matches --color-bg. A meta tag cannot read a CSS variable, so these two values are repeated here.
const STATUS_BAR: Record<Theme, string> = { light: '#F8FAFC', dark: '#0F172A' }

export function getPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // Private mode, or storage blocked: the app still works, it just forgets the choice on reload.
    return 'system'
  }
}

export function setPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(KEY, preference)
  } catch {
    // See getPreference.
  }
  applyTheme(preference)
}

export function applyTheme(preference: ThemePreference = getPreference()) {
  const theme: Theme = preference === 'system' ? (matchMedia(DARK_QUERY).matches ? 'dark' : 'light') : preference
  const root = document.documentElement
  root.dataset.theme = theme
  // Native controls and scrollbars follow this, not data-theme.
  root.style.colorScheme = theme

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  meta.content = STATUS_BAR[theme]
}

// Returns the function that stops watching.
export function watchSystem(): () => void {
  const query = matchMedia(DARK_QUERY)
  const onChange = () => {
    if (getPreference() === 'system') {
      applyTheme('system')
    }
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
