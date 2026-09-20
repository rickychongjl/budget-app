import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { onOutbox } from '../../offline/outbox'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'

// Story "Transactions 4": after a transaction is added, edited or deleted in a past cycle, offer to update that
// cycle's closing balance. Whether the write landed in a past cycle is the server's call
// (requiresClosingBalanceReview on the sync result); nothing here works it out from dates. So the question is asked
// when the change syncs, which for an offline change is when the connection comes back.
// Mounted once, inside the router.
export function ClosingBalancePrompt() {
  const navigate = useNavigate()
  const [cycleId, setCycleId] = useState<string | null>(null)

  useEffect(
    () =>
      onOutbox((event) => {
        if (event.type !== 'synced' || !(event.result as { requiresClosingBalanceReview?: boolean } | null)?.requiresClosingBalanceReview) {
          return
        }
        const changed = event.item.type === 'transaction.create' ? event.item.create.cycleId : event.before?.cycleId
        if (changed) {
          setCycleId(changed)
        }
      }),
    [],
  )

  return (
    <Dialog
      open={cycleId !== null}
      title="You changed a past cycle"
      onClose={() => setCycleId(null)}
      actions={
        <>
          {/* The safe choice is on the left. */}
          <Button variant="secondary" onClick={() => setCycleId(null)}>
            Not now
          </Button>
          <Button
            onClick={() => {
              void navigate(`/cycles/${cycleId}`)
              setCycleId(null)
            }}
          >
            Update balance
          </Button>
        </>
      }
    >
      Update its closing balance too?
    </Dialog>
  )
}
