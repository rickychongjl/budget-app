import { useEffect } from 'react'
import { useToast } from '../ui/useToast'
import { watchForUpdates } from './update'

// Renders nothing. Mounted once, above the session: an update matters whether or not anyone is signed in.
export function UpdatePrompt() {
  const toast = useToast()

  useEffect(() => {
    watchForUpdates((apply) => {
      toast.show({ message: 'A new version is ready.', sticky: true, action: { label: 'Update', onAction: () => void apply() } })
    })
  }, [toast])

  return null
}
