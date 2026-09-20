import { SegmentedControl } from '../../ui/SegmentedControl'
import { toSlot } from '../../ui/slots'
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

      {/* MASTER 9: more options than a segmented control can hold, so a scrolling chip row in its own container. */}
      {filter.kind === 'category' && categories.length > 0 && (
        <div role="radiogroup" aria-label="Category" className={styles.chips}>
          {categories.map((category) => (
            <label key={category.id} className={styles.chip} data-slot={toSlot(category.colour)}>
              <input
                type="radio"
                name="trend-category"
                className={styles.chipInput}
                value={category.id}
                checked={category.id === chosen}
                onChange={() => onChange({ kind: 'category', categoryId: category.id, name: category.name })}
              />
              <span className={styles.chipText}>{category.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
