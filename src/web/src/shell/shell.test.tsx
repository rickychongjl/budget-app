import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppShell } from './AppShell'
import { ConnectivityBanner } from './ConnectivityBanner'
import { Screen } from './Screen'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderShell(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Screen title="Home"><Where /></Screen>} />
          <Route path="cycles" element={<Screen title="Cycles"><Where /></Screen>} />
          <Route path="settings" element={<Screen title="Settings"><Where /></Screen>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return within(screen.getByRole('navigation', { name: 'Main' }))
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  act(() => void window.dispatchEvent(new Event(online ? 'online' : 'offline')))
}

afterEach(() => setOnline(true))

describe('tab bar', () => {
  test('has the four tabs, each with a label that is always visible', () => {
    const tabs = renderShell()

    expect(tabs.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(tabs.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(tabs.getByRole('link', { name: 'Cycles' })).toBeInTheDocument()
    expect(tabs.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  test('announces the current tab, and only that one', async () => {
    const tabs = renderShell('/')
    expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Cycles' })).not.toHaveAttribute('aria-current')

    await userEvent.click(tabs.getByRole('link', { name: 'Cycles' }))

    expect(tabs.getByRole('link', { name: 'Cycles' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { level: 1, name: 'Cycles' })).toBeInTheDocument()
  })

  test('Add opens the sheet over the current screen rather than navigating', async () => {
    const tabs = renderShell('/cycles')

    await userEvent.click(tabs.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/cycles')
  })
})

test('a screen has one h1: its title in the top bar', () => {
  renderShell('/settings')

  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings')
})

describe('connectivity banner', () => {
  test('says nothing when online with nothing waiting', () => {
    render(<ConnectivityBanner waiting={0} />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  test('offline is information, not an error', () => {
    render(<ConnectivityBanner waiting={0} />)

    setOnline(false)

    expect(screen.getByRole('status')).toHaveTextContent("Offline. Changes will sync when you're back online.")
  })

  test.each([
    [1, '1 change waiting to sync.'],
    [3, '3 changes waiting to sync.'],
  ])('%i queued: "%s"', (waiting, text) => {
    render(<ConnectivityBanner waiting={waiting} />)

    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  test('offline with changes queued says both', () => {
    render(<ConnectivityBanner waiting={2} />)

    setOnline(false)

    expect(screen.getByRole('status')).toHaveTextContent('Offline. 2 changes waiting to sync.')
  })

  test('clears when the connection returns', () => {
    render(<ConnectivityBanner waiting={0} />)
    setOnline(false)

    setOnline(true)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
