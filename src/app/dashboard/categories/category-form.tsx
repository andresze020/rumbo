'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createCategoryAction, updateCategoryAction } from './actions'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { CategoryStylePicker } from '@/components/category-style-picker'
import { formatLabel as formatValue } from '@/lib/format'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  sort_order: number | null
  color: string | null
  icon: string | null
  exclude_from_budget: boolean
  exclude_from_reports: boolean
}

type ParentCategoryOption = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
  icon: string | null
}

type CategoryTypeFilter = 'income' | 'expense' | 'financial' | 'adjustment' | 'all'

const categoryTypes = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'financial', label: 'Financial' },
  { value: 'adjustment', label: 'Adjustment' },
]

const reportingTypes = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'debt_principal', label: 'Debt principal' },
  { value: 'debt_interest', label: 'Debt interest' },
  { value: 'investment', label: 'Investment' },
  { value: 'savings', label: 'Savings' },
  { value: 'adjustment', label: 'Adjustment' },
]

const selectClassName = nativeSelectCls

function defaultReportingTypeFor(categoryType: string) {
  if (categoryType === 'income') return 'income'
  if (categoryType === 'financial') return 'transfer'
  if (categoryType === 'adjustment') return 'adjustment'
  return 'expense'
}

function getCategoryPath(
  category: { name: string; parent_category_id: string | null },
  categoriesById: Record<string, { name: string }>
) {
  const parentName = category.parent_category_id
    ? categoriesById[category.parent_category_id]?.name
    : null
  return parentName ? `${parentName} / ${category.name}` : category.name
}

function getCompatibleParentOptions({
  category,
  categoryType,
  parentCategories,
  reportingType,
}: {
  category?: Category
  categoryType: string
  parentCategories: ParentCategoryOption[]
  reportingType: string
}) {
  const categoryHasChildren = category
    ? parentCategories.some((option) => option.parent_category_id === category.id)
    : false

  if (categoryHasChildren) return []

  return parentCategories.filter((option) => {
    if (option.is_archived || option.parent_category_id) return false
    if (category && option.id === category.id) return false
    return (
      option.category_type === categoryType &&
      option.reporting_type === reportingType
    )
  })
}

function categoriesPath({
  showArchived,
  categoryType,
}: {
  showArchived?: boolean
  categoryType?: CategoryTypeFilter
} = {}) {
  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  if (categoryType && categoryType !== 'all') params.set('categoryType', categoryType)
  const queryString = params.toString()
  return `/dashboard/categories${queryString ? `?${queryString}` : ''}`
}

export function CategoryForm({
  category,
  categoryTypeFilter,
  mode,
  parentCategories,
  categoriesById,
  showArchived,
}: {
  category?: Category
  categoryTypeFilter: CategoryTypeFilter
  mode: 'create' | 'edit'
  parentCategories: ParentCategoryOption[]
  categoriesById: Record<string, ParentCategoryOption>
  showArchived: boolean
}) {
  const defaultCategoryType =
    category?.category_type ??
    (categoryTypeFilter === 'all' ? 'expense' : categoryTypeFilter)
  const defaultReportingType =
    category?.reporting_type ?? defaultReportingTypeFor(defaultCategoryType)

  const [selectedCategoryType, setSelectedCategoryType] = useState(defaultCategoryType)
  const [selectedReportingType, setSelectedReportingType] = useState(defaultReportingType)
  const [selectedParentId, setSelectedParentId] = useState(
    category?.parent_category_id ?? ''
  )

  const parentOptions = getCompatibleParentOptions({
    category,
    categoryType: selectedCategoryType,
    parentCategories,
    reportingType: selectedReportingType,
  })

  const currentParent = category?.parent_category_id
    ? categoriesById[category.parent_category_id]
    : null
  const includesCurrentParent = currentParent
    ? parentOptions.some((option) => option.id === currentParent.id)
    : true

  const cancelHref = categoriesPath({ showArchived, categoryType: categoryTypeFilter })
  const formAction = mode === 'create' ? createCategoryAction : updateCategoryAction

  function handleCategoryTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newType = e.target.value
    setSelectedCategoryType(newType)
    setSelectedReportingType(defaultReportingTypeFor(newType))
    setSelectedParentId('')
  }

  function handleReportingTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedReportingType(e.target.value)
    setSelectedParentId('')
  }

  return (
    <form action={formAction} className="space-y-4">
      {category ? (
        <>
          <input type="hidden" name="category_id" value={category.id} />
          <input
            type="hidden"
            name="show_archived"
            value={showArchived ? 'true' : 'false'}
          />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`name_${mode}`}>Name</Label>
          <Input
            id={`name_${mode}`}
            name="name"
            defaultValue={category?.name ?? ''}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`category_type_${mode}`}>Category type</Label>
          <select
            id={`category_type_${mode}`}
            name="category_type"
            value={selectedCategoryType}
            onChange={handleCategoryTypeChange}
            className={selectClassName}
          >
            {categoryTypes.map((categoryType) => (
              <option key={categoryType.value} value={categoryType.value}>
                {categoryType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`reporting_type_${mode}`}>Reporting type</Label>
          <select
            id={`reporting_type_${mode}`}
            name="reporting_type"
            value={selectedReportingType}
            onChange={handleReportingTypeChange}
            className={selectClassName}
          >
            {reportingTypes.map((reportingType) => (
              <option key={reportingType.value} value={reportingType.value}>
                {reportingType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`parent_category_id_${mode}`}>Parent</Label>
          <select
            id={`parent_category_id_${mode}`}
            name="parent_category_id"
            value={selectedParentId}
            onChange={(e) => setSelectedParentId(e.target.value)}
            className={selectClassName}
          >
            <option value="">None</option>
            {currentParent && !includesCurrentParent ? (
              <option value={currentParent.id}>
                {currentParent.icon ? `${currentParent.icon} ` : ''}
                {currentParent.name} - parent unavailable
              </option>
            ) : null}
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.icon ? `${option.icon} ` : ''}
                {getCategoryPath(option, categoriesById)} -{' '}
                {formatValue(option.category_type)} /{' '}
                {formatValue(option.reporting_type)}
              </option>
            ))}
          </select>
          {parentOptions.length === 0 && !currentParent && (
            <p className="text-xs text-muted-foreground">
              No compatible parent categories for this type and reporting type.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sort_order_${mode}`}>Sort order</Label>
          <Input
            id={`sort_order_${mode}`}
            name="sort_order"
            type="number"
            step="1"
            defaultValue={category?.sort_order ?? ''}
          />
        </div>

      </div>

      <CategoryStylePicker
        mode={mode}
        defaultColor={category?.color}
        defaultIcon={category?.icon}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="exclude_from_budget"
            defaultChecked={category?.exclude_from_budget ?? false}
            className="mt-0.5 size-4"
          />
          <span className="space-y-1">
            <span className="block">Exclude from budget</span>
            <span className="block text-sm font-normal text-muted-foreground">
              Keeps this out of budget workflows.
            </span>
          </span>
        </Label>

        <Label className="items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="exclude_from_reports"
            defaultChecked={category?.exclude_from_reports ?? false}
            className="mt-0.5 size-4"
          />
          <span className="space-y-1">
            <span className="block">Exclude from reports</span>
            <span className="block text-sm font-normal text-muted-foreground">
              Keeps this out of reporting totals.
            </span>
          </span>
        </Label>
      </div>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText={mode === 'create' ? 'Creating category' : 'Saving category'}
        >
          {mode === 'create' ? 'Create category' : 'Save category'}
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
