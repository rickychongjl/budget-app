import { useEffect } from 'react'

type Meta = { title: string; description: string; path: string }

function upsert(selector: string, create: () => HTMLMetaElement, content: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector) ?? document.head.appendChild(create())
  const before = element.getAttribute('content')
  element.setAttribute('content', content)
  return () => (before === null ? element.remove() : element.setAttribute('content', before))
}

function meta(attribute: 'name' | 'property', key: string) {
  return () => {
    const element = document.createElement('meta')
    element.setAttribute(attribute, key)
    return element
  }
}

// The page title, description and Open Graph tags for a public route, put back as they were when the page goes. Set
// from script, so a link preview from a crawler that runs no JavaScript still sees index.html's defaults.
export function usePageMeta({ title, description, path }: Meta) {
  useEffect(() => {
    const full = title === 'Tight Arse' ? title : `${title} · Tight Arse`
    const url = new URL(path, location.origin).href
    const previousTitle = document.title
    document.title = full
    const undo = [
      upsert('meta[name="description"]', meta('name', 'description'), description),
      upsert('meta[property="og:title"]', meta('property', 'og:title'), full),
      upsert('meta[property="og:description"]', meta('property', 'og:description'), description),
      upsert('meta[property="og:type"]', meta('property', 'og:type'), 'website'),
      upsert('meta[property="og:url"]', meta('property', 'og:url'), url),
      upsert('meta[property="og:site_name"]', meta('property', 'og:site_name'), 'Tight Arse'),
    ]
    return () => {
      document.title = previousTitle
      undo.reverse().forEach((restore) => restore())
    }
  }, [title, description, path])
}
