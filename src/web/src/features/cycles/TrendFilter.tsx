import { ChipGroup } from '../../ui/ChipGroup'
import { SegmentedControl } from '../../ui/SegmentedControl'
import styles from './Trend.module.css'
import type { TrendCategory, TrendFilter } from './trend'

const KINDS = [
  { value: 'spending', label: 'Spending' },
  { value: 'category', label: 'Category' },
  { value: 'accrued', label: 'Accrued' },
] as const

type Props = { filter: TrendFilter; categories: TrendCategory[]; onChange: (filter: TrendFilter) => void }

export function TrendFilterControl({ filter, categories, onChange }: Props) {
  const chosen = filter.kind === 'category' ? filter.categoryId : categories[0]?.id

  return (
    <div className={styles.filter}>
      <SegmentedControl
        label="What the chart shows"
        options={KINDS}
        value={filter.kind}
        onChange={(kind) => {
          if (kind !== 'category') {
            onChange({ kind })
          } else if (categories[0]) {
            onChange({ kind: 'category', categoryId: categories[0].id, name: categories[0].name })
          }
        }}
      />

      {filter.kind === 'category' && categories.length > 0 && (
        <ChipGroup
          label="Category"
          options={categories.map((category) => ({ value: category.id, label: category.name, colour: category.colour }))}
          value={chosen ?? ''}
          onChange={(id) => onChange({ kind: 'category', categoryId: id, name: categories.find((category) => category.id === id)!.name })}
        />
      )}
    </div>
  )
}
