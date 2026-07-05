'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Shapes } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type TransactionType = 'income' | 'expense'

export type CategoryPickerCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon?: string | null
}

type CategoryPickerProps = {
  categories: CategoryPickerCategory[]
  transactionType: TransactionType
  onCategoryChange: (categoryId: string) => void
  defaultCategoryId?: string
  /** External selection (e.g. from a "frequently used" chip) to sync into the picker. */
  selectedCategoryId?: string
}

const selectCls =
  'h-11 w-full appearance-none truncate rounded-xl border border-input bg-transparent pl-10 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

/**
 * The selected option's text already carries the category emoji, so the
 * leading slot only shows the generic glyph when there is no emoji —
 * otherwise the icon would appear twice in the closed select.
 */
function SelectShell({
  hasEmoji,
  children,
}: {
  hasEmoji: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {hasEmoji ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground"
        >
          <Shapes className="size-4.5" />
        </span>
      )}
      {children}
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export function CategoryPicker({
  categories,
  transactionType,
  onCategoryChange,
  defaultCategoryId,
  selectedCategoryId,
}: CategoryPickerProps) {
  const defaultCategory = defaultCategoryId
    ? categories.find((category) => category.id === defaultCategoryId)
    : null
  const [parentCategoryId, setParentCategoryId] = useState(
    defaultCategory?.parent_category_id ?? defaultCategory?.id ?? ''
  )
  const [subcategoryId, setSubcategoryId] = useState(
    defaultCategory?.parent_category_id ? defaultCategory.id : ''
  )

  // Keep internal selection in sync when a category is chosen externally
  // (e.g. by clicking a "frequently used" chip). Adjust state during render
  // rather than in an effect, per https://react.dev/learn/you-might-not-need-an-effect.
  const [syncedSelectedCategoryId, setSyncedSelectedCategoryId] = useState(selectedCategoryId)
  if (
    selectedCategoryId &&
    selectedCategoryId !== syncedSelectedCategoryId &&
    selectedCategoryId !== (subcategoryId || parentCategoryId)
  ) {
    setSyncedSelectedCategoryId(selectedCategoryId)
    const category = categories.find((c) => c.id === selectedCategoryId)
    if (category) {
      if (category.parent_category_id) {
        setParentCategoryId(category.parent_category_id)
        setSubcategoryId(category.id)
      } else {
        setParentCategoryId(category.id)
        setSubcategoryId('')
      }
    }
  }

  const parentCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.category_type === transactionType &&
          category.parent_category_id === null
      ),
    [categories, transactionType]
  )

  const childCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.category_type === transactionType &&
          category.parent_category_id === parentCategoryId
      ),
    [categories, parentCategoryId, transactionType]
  )

  const finalCategoryId = subcategoryId || parentCategoryId
  const selectedParent = parentCategories.find((c) => c.id === parentCategoryId)
  const selectedChild = childCategories.find((c) => c.id === subcategoryId)

  function handleParentChange(value: string) {
    setParentCategoryId(value)
    setSubcategoryId('')
    onCategoryChange(value)
  }

  function handleSubcategoryChange(value: string) {
    setSubcategoryId(value)
    onCategoryChange(value || parentCategoryId)
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="category_id" value={finalCategoryId} />

      <div className="space-y-1.5">
        <Label htmlFor={`parent_category_id_${transactionType}`}>
          Category
        </Label>
        <SelectShell hasEmoji={Boolean(selectedParent?.icon)}>
          <select
            id={`parent_category_id_${transactionType}`}
            value={parentCategoryId}
            onChange={(event) => handleParentChange(event.target.value)}
            className={cn(selectCls, selectedParent?.icon && 'pl-3.5')}
            disabled={!parentCategories.length}
          >
            <option value="" disabled>
              Select category
            </option>
            {parentCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon ? `${category.icon} ` : ''}
                {category.name}
              </option>
            ))}
          </select>
        </SelectShell>
      </div>

      {parentCategoryId && childCategories.length ? (
        <div className="space-y-1.5">
          <Label htmlFor={`subcategory_id_${transactionType}`}>
            Subcategory
          </Label>
          <SelectShell hasEmoji={Boolean(selectedChild?.icon)}>
            <select
              id={`subcategory_id_${transactionType}`}
              value={subcategoryId}
              onChange={(event) => handleSubcategoryChange(event.target.value)}
              className={cn(selectCls, selectedChild?.icon && 'pl-3.5')}
            >
              <option value="">No subcategory / General</option>
              {childCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon ? `${category.icon} ` : ''}
                  {category.name}
                </option>
              ))}
            </select>
          </SelectShell>
        </div>
      ) : null}

      {!parentCategories.length ? (
        <p className="text-sm text-muted-foreground">
          No compatible categories available for this transaction type.
        </p>
      ) : null}
    </div>
  )
}
