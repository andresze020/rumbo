'use client'

import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'

type TransactionType = 'income' | 'expense'

export type CategoryPickerCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
}

type CategoryPickerProps = {
  categories: CategoryPickerCategory[]
  transactionType: TransactionType
  onCategoryChange: (categoryId: string) => void
  defaultCategoryId?: string
}

export function CategoryPicker({
  categories,
  transactionType,
  onCategoryChange,
  defaultCategoryId,
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

      <div className="space-y-2">
        <Label htmlFor={`parent_category_id_${transactionType}`}>
          Category
        </Label>
        <select
          id={`parent_category_id_${transactionType}`}
          value={parentCategoryId}
          onChange={(event) => handleParentChange(event.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          disabled={!parentCategories.length}
        >
          <option value="" disabled>
            Select category
          </option>
          {parentCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {parentCategoryId && childCategories.length ? (
        <div className="space-y-2">
          <Label htmlFor={`subcategory_id_${transactionType}`}>
            Subcategory
          </Label>
          <select
            id={`subcategory_id_${transactionType}`}
            value={subcategoryId}
            onChange={(event) => handleSubcategoryChange(event.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">No subcategory / General</option>
            {childCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
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
