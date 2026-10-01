'use client'

import { useState } from 'react'
import { SearchablePicker, type PickerGroup } from '@/components/searchable-picker'

/**
 * "Add budget line" category field (MQ-008): the categories not yet budgeted,
 * parents first with their subcategories indented under them, searchable on a
 * phone instead of a flat native list of "Parent / Child" names.
 */
export function BudgetCategoryPicker({ groups }: { groups: PickerGroup[] }) {
  const [value, setValue] = useState('')
  return (
    <SearchablePicker
      id="category_id"
      name="category_id"
      value={value}
      onChange={setValue}
      groups={groups}
      placeholder="Select category"
      title="Category"
      searchPlaceholder="Search categories..."
    />
  )
}
