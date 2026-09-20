import { useEffect, useReducer } from 'react'

// Recharts draws an SVG and wants colours as values, not as `var(--...)` on a class. So the chart reads the tokens at
// render time (MASTER 10) and re-reads them when the theme changes, which is what keeps one rule about colour: the
// values still live in tokens.css and nothing here knows a hex.
export const cssColour = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || 'currentColor'

// Re-renders whoever calls it when data-theme changes on <html>, so a theme switch redraws the chart.
export function useThemeChange() {
  const [, redraw] = useReducer((count: number) => count + 1, 0)

  useEffect(() => {
    const observer = new MutationObserver(redraw)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
}
