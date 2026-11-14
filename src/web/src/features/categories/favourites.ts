// Category ids pinned by the user, per device: which categories the picker offers first. A convenience, not a fact
// about the budget, so it lives beside the theme rather than on the server.
const KEY = 'budget.favouriteCategories'

export function readFavourites(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    // Anything but a list of ids is treated as nothing pinned, so a bad value cannot break the picker.
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function isFavourite(categoryId: string): boolean {
  return readFavourites().includes(categoryId)
}

// Pinning goes on the end, so the picker shows them in the order they were chosen. Returns the new list.
export function toggleFavourite(categoryId: string): string[] {
  const now = readFavourites()
  const next = now.includes(categoryId) ? now.filter((id) => id !== categoryId) : [...now, categoryId]
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode: the pin lasts for this visit only.
  }
  return next
}
