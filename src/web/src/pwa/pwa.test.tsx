import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../ui/Toast'
import { InstallHint } from './InstallHint'
import { UpdatePrompt } from './UpdatePrompt'

// The worker itself is Workbox's and is exercised by the Playwright specs; here the page's side is what is tested.
const registration = vi.hoisted(() => ({ onNeedRefresh: undefined as (() => void) | undefined, update: vi.fn(() => Promise.resolve()) }))
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: { onNeedRefresh?: () => void }) => {
    registration.onNeedRefresh = options.onNeedRefresh
    return registration.update
  },
}))

describe('update prompt', () => {
  test('a waiting build is offered, stays until answered, and takes over on Update', async () => {
    // Faking the clock here hangs user-event, so the four-second timer is watched for instead of run down.
    const timers = vi.spyOn(window, 'setTimeout')
    render(
      <ToastProvider>
        <UpdatePrompt />
      </ToastProvider>,
    )
    expect(screen.queryByText('A new version is ready.')).not.toBeInTheDocument()

    act(() => registration.onNeedRefresh?.())
    expect(screen.getByText('A new version is ready.')).toBeInTheDocument()
    // An ordinary toast arms its timer as it appears; this one waits for a decision.
    expect(timers).not.toHaveBeenCalledWith(expect.any(Function), 4000)
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(registration.update).toHaveBeenCalledWith(true)
  })
})

function installPrompt(outcome: 'accepted' | 'dismissed') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

describe('install hint', () => {
  beforeEach(() => {
    localStorage.clear()
    // Forget any prompt a previous test captured.
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
  })

  test('a browser that can neither prompt nor add to the home screen gets nothing', () => {
    render(<InstallHint />)
    expect(screen.queryByRole('heading', { name: 'Add Tight Arse to your Home Screen' })).not.toBeInTheDocument()
  })

  test('when the browser offers to install, Install asks it to, and an accepted install ends the hint', async () => {
    render(<InstallHint />)
    const event = installPrompt('accepted')
    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Add Tight Arse to your Home Screen' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(event.prompt).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add Tight Arse to your Home Screen' })).not.toBeInTheDocument())
  })

  test('a declined install keeps the offer, and Not now ends it for good', async () => {
    render(<InstallHint />)
    installPrompt('dismissed')
    await userEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('heading', { name: 'Add Tight Arse to your Home Screen' })).not.toBeInTheDocument()
    expect(localStorage.getItem('budget.install-hint')).toBe('dismissed')
  })

  test('Safari on an iPhone has no prompt, so the hint says where Add to Home Screen is', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
    render(<InstallHint />)
    expect(screen.getByText(/then "Add to Home Screen"/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText(/then "Add to Home Screen"/)).not.toBeInTheDocument()
  })

  test('already on the home screen, there is nothing to offer', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148')
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query.includes('standalone'), media: query } as MediaQueryList))
    render(<InstallHint />)
    expect(screen.queryByRole('heading', { name: 'Add Tight Arse to your Home Screen' })).not.toBeInTheDocument()
  })
})
