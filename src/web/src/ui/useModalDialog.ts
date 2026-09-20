import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from 'react'

// Sheet and Dialog are both the native <dialog> opened with showModal(). The browser then does what MASTER 9 asks for and
// what is easy to get wrong by hand: focus is trapped, the rest of the page is inert, Escape asks to close, the scrim is
// ::backdrop, and focus goes back to whatever opened it.
// The owner holds the open state. Escape and a scrim tap only ask (onClose); nothing closes until `open` turns false,
// so a form with unsaved input can refuse.
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && dialog && !dialog.open) {
      dialog.showModal()
    }
    return () => dialog?.close()
  }, [open])

  return {
    ref,
    onCancel: (event: SyntheticEvent) => {
      event.preventDefault()
      onClose()
    },
    // A tap on ::backdrop is delivered to the dialog element itself; a tap on anything inside has a deeper target.
    onClick: (event: MouseEvent) => {
      if (event.target === ref.current) {
        onClose()
      }
    },
  }
}
