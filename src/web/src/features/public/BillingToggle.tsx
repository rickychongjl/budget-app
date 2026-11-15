import { SegmentedControl } from '../../ui/SegmentedControl'
import { yearlySaving, type Billing } from './billing'
import { CATALOGUE } from './catalogue'

type Props = { value: Billing; onChange: (value: Billing) => void }

// Yearly | Monthly, yearly first and the default. The saving is worked out from the catalogue, and left off if there is none.
export function BillingToggle({ value, onChange }: Props) {
  const { monthly, yearly } = CATALOGUE.premiumPrice
  const saving = yearlySaving(monthly, yearly)

  return (
    <SegmentedControl
      label="Billing period"
      options={[
        { value: 'yearly', label: 'Yearly', tag: saving > 0 ? `Save ${saving}%` : undefined },
        { value: 'monthly', label: 'Monthly' },
      ]}
      value={value}
      onChange={onChange}
    />
  )
}
