import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Plus } from 'lucide-react'
import { describe, expect, test, vi } from 'vitest'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Field } from './Field'
import { ProgressBar } from './ProgressBar'
import { SegmentedControl } from './SegmentedControl'
import { Sheet } from './Sheet'
import { StatusBadge } from './StatusBadge'
import { ToastProvider } from './Toast'
import { useToast } from './useToast'

describe('Button', () => {
  test('is a real button that does not submit a form by accident', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  test('while pending it is disabled, announced as busy, and keeps its label so its width does not change', async () => {
    const onClick = vi.fn()
    render(
      <Button pending icon={Plus} onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })

    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(onClick).not.toHaveBeenCalled()
  })

  test('its icon is decorative', () => {
    const { container } = render(<Button icon={Plus}>Add</Button>)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe.each([
  ['Sheet', Sheet],
  ['Dialog', Dialog],
] as const)('%s', (_, Modal) => {
  const open = (onClose = vi.fn()) => {
    render(
      <Modal open title="Add transaction" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    )
    return { onClose, dialog: screen.getByRole('dialog', { name: 'Add transaction' }) }
  }

  test('is closed until asked', () => {
    render(
      <Modal open={false} title="Add transaction" onClose={vi.fn()}>
        body
      </Modal>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('opens as a modal named by its title', () => {
    expect(open().dialog).toHaveAttribute('open')
  })

  test('Escape asks to close, and the owner decides', () => {
    const { onClose, dialog } = open()

    // What the browser fires for Escape on a modal dialog.
    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(dialog).toHaveAttribute('open')
  })

  test('a tap on the scrim closes it; a tap inside does not', async () => {
    const { onClose, dialog } = open()

    await userEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(onClose).not.toHaveBeenCalled()

    // The ::backdrop belongs to the dialog element, so a scrim tap arrives with the dialog itself as the target.
    await userEvent.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

test('Sheet has a visible Close button, because a drag or a scrim tap is never the only way out', async () => {
  const onClose = vi.fn()
  render(
    <Sheet open title="Add transaction" onClose={onClose}>
      body
    </Sheet>,
  )

  await userEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(onClose).toHaveBeenCalledOnce()
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'debit', label: 'Spending' },
    { value: 'credit', label: 'Income' },
  ] as const

  test('is a radio group that announces the selection', () => {
    render(<SegmentedControl label="Type" options={options} value="credit" onChange={vi.fn()} />)

    expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Spending' })).not.toBeChecked()
  })

  test('reports the chosen value', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="Type" options={options} value="credit" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Spending' }))

    expect(onChange).toHaveBeenCalledWith('debit')
  })
})

describe('ProgressBar', () => {
  test('announces the sentence it is given, not a bare percentage', () => {
    render(<ProgressBar value={0.5} label="Food: $200 of $400, $200 left" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuetext', 'Food: $200 of $400, $200 left')
    expect(bar).toHaveAttribute('aria-valuenow', '50')
  })

  test('over budget fills the track and no further', () => {
    render(<ProgressBar value={1.05} tone="negative" label="Food: over by $20" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar.firstElementChild).toHaveStyle({ transform: 'scaleX(1)' })
  })

  test('nothing budgeted draws an empty track', () => {
    render(<ProgressBar value={null} label="Misc: $0 of $0" />)

    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ transform: 'scaleX(0)' })
  })
})

describe('Field', () => {
  test('the label is visible and tied to the input', () => {
    render(<Field label="Opening balance" inputMode="decimal" />)

    expect(screen.getByLabelText('Opening balance')).toHaveAttribute('inputmode', 'decimal')
  })

  test('an error sits with the field and is announced with it', () => {
    render(<Field label="Opening balance" error="Enter an amount" />)

    const input = screen.getByLabelText('Opening balance')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter an amount')
  })
})

test('StatusBadge says its status in a word, with a decorative icon beside it', () => {
  const { container } = render(<StatusBadge tone="negative">Over by $20.00</StatusBadge>)

  expect(screen.getByText('Over by $20.00')).toBeInTheDocument()
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

describe('Toast', () => {
  function Trigger({ onUndo }: { onUndo?: () => void }) {
    const toast = useToast()
    return (
      <>
        <button type="button" onClick={() => toast.show({ message: 'Saved', action: onUndo && { label: 'Undo', onAction: onUndo } })}>
          save
        </button>
        <button type="button" onClick={() => toast.show({ message: 'Could not save', tone: 'error' })}>
          fail
        </button>
      </>
    )
  }

  const setup = (onUndo?: () => void) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    )
    return user
  }

  test('is announced politely and leaves after four seconds', async () => {
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'save' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    act(() => void vi.advanceTimersByTime(4000))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    vi.useRealTimers()
  })

  test('an error stays until dismissed', async () => {
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'fail' }))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('status')).toHaveTextContent('Could not save')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    vi.useRealTimers()
  })

  test('its action runs and the toast goes', async () => {
    const onUndo = vi.fn()
    const user = setup(onUndo)

    await user.click(screen.getByRole('button', { name: 'save' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onUndo).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    vi.useRealTimers()
  })

  test('only one shows at a time: the newest replaces the last', async () => {
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'save' }))
    await user.click(screen.getByRole('button', { name: 'fail' }))

    expect(screen.getByRole('status')).toHaveTextContent('Could not save')
    expect(screen.getByRole('status')).not.toHaveTextContent('Saved')
    vi.useRealTimers()
  })
})
