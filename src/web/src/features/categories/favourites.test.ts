import { beforeEach, describe, expect, test } from 'vitest'
import { isFavourite, readFavourites, toggleFavourite } from './favourites'

const KEY = 'budget.favouriteCategories'

describe('favourites', () => {
  beforeEach(() => localStorage.clear())

  test('nothing is pinned to start with', () => {
    expect(readFavourites()).toEqual([])
    expect(isFavourite('food')).toBe(false)
  })

  test('pinning adds to the end, and pinning again removes', () => {
    toggleFavourite('fun')
    toggleFavourite('rent')
    expect(readFavourites()).toEqual(['fun', 'rent'])
    expect(isFavourite('rent')).toBe(true)

    toggleFavourite('fun')
    expect(readFavourites()).toEqual(['rent'])
    expect(isFavourite('fun')).toBe(false)
  })

  test('a corrupt value means no favourites, not a broken picker', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readFavourites()).toEqual([])
  })

  test('anything but a list of ids is ignored', () => {
    localStorage.setItem(KEY, JSON.stringify({ food: true }))
    expect(readFavourites()).toEqual([])

    localStorage.setItem(KEY, JSON.stringify(['food', 7, null, 'rent']))
    expect(readFavourites()).toEqual(['food', 'rent'])
  })
})
