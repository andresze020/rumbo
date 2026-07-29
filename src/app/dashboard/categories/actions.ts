'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const CATEGORY_TYPES = ['income', 'expense', 'financial', 'adjustment'] as const

const REPORTING_TYPES = [
  'income',
  'expense',
  'transfer',
  'debt_principal',
  'debt_interest',
  'investment',
  'savings',
  'adjustment',
] as const

type CategoryType = (typeof CATEGORY_TYPES)[number]
type ReportingType = (typeof REPORTING_TYPES)[number]
type CategoryHierarchyRow = {
  id: string
  parent_category_id: string | null
  category_type: string
  reporting_type: string
  is_archived: boolean
}

function redirectWithError(message: string): never {
  redirect(`/dashboard/categories?error=${encodeURIComponent(message)}`)
}

function isCategoryType(value: string): value is CategoryType {
  return CATEGORY_TYPES.includes(value as CategoryType)
}

function isReportingType(value: string): value is ReportingType {
  return REPORTING_TYPES.includes(value as ReportingType)
}

function isCompatibleReportingType(
  categoryType: CategoryType,
  reportingType: ReportingType
) {
  if (categoryType === 'income') {
    return reportingType === 'income'
  }

  if (categoryType === 'expense') {
    return reportingType === 'expense' || reportingType === 'debt_interest'
  }

  if (categoryType === 'financial') {
    return ['transfer', 'debt_principal', 'investment', 'savings'].includes(
      reportingType
    )
  }

  return reportingType === 'adjustment'
}

function parseNullableInteger(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()

  if (!text) {
    return null
  }

  const numberValue = Number(text)

  return Number.isInteger(numberValue) ? numberValue : undefined
}

async function getAuthenticatedHousehold() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    redirectWithError('Could not load your household.')
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  return {
    supabase,
    userId: user.id,
    householdId: profile.default_household_id as string,
  }
}

function revalidateCategorySurfaces() {
  revalidatePath('/dashboard/categories')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/onboarding/categories')
}

function wouldCreateParentLoop(
  categoryId: string,
  parentCategoryId: string | null,
  categories: { id: string; parent_category_id: string | null }[]
) {
  let currentParentId = parentCategoryId
  const visitedCategoryIds = new Set<string>()
  const parentByCategoryId = new Map(
    categories.map((category) => [category.id, category.parent_category_id])
  )

  while (currentParentId) {
    if (currentParentId === categoryId || visitedCategoryIds.has(currentParentId)) {
      return true
    }

    visitedCategoryIds.add(currentParentId)
    currentParentId = parentByCategoryId.get(currentParentId) ?? null
  }

  return false
}

function validateParentCategory({
  categoryId,
  parentCategoryId,
  categoryType,
  reportingType,
  categories,
}: {
  categoryId?: string
  parentCategoryId: string | null
  categoryType: CategoryType
  reportingType: ReportingType
  categories: CategoryHierarchyRow[]
}) {
  if (!parentCategoryId) {
    return
  }

  if (categoryId && parentCategoryId === categoryId) {
    redirectWithError('A category cannot be its own parent.')
  }

  const parentCategory = categories.find(
    (category) => category.id === parentCategoryId
  )

  if (!parentCategory) {
    redirectWithError('Parent category was not found for this household.')
  }

  if (parentCategory.is_archived) {
    redirectWithError('Parent category must be active.')
  }

  if (parentCategory.parent_category_id) {
    redirectWithError('A child category cannot be used as a parent.')
  }

  if (parentCategory.category_type !== categoryType) {
    redirectWithError('Parent category must use the same category type.')
  }

  if (parentCategory.reporting_type !== reportingType) {
    redirectWithError('Parent category must use the same reporting type.')
  }

  if (
    categoryId &&
    categories.some((category) => category.parent_category_id === categoryId)
  ) {
    redirectWithError('A category with child categories cannot become a child.')
  }

  if (
    categoryId &&
    wouldCreateParentLoop(categoryId, parentCategoryId, categories)
  ) {
    redirectWithError('Parent category would create a hierarchy loop.')
  }
}

export async function createCategoryAction(formData: FormData) {
  // The onboarding wizard reuses this action; `return_to=onboarding` keeps
  // success/error redirects inside the wizard instead of /dashboard/categories.
  const fromOnboarding = String(formData.get('return_to') ?? '') === 'onboarding'
  const fail: (message: string) => never = (message) =>
    fromOnboarding
      ? redirect(`/onboarding/categories?error=${encodeURIComponent(message)}`)
      : redirectWithError(message)

  const name = String(formData.get('name') ?? '').trim()
  const categoryType = String(formData.get('category_type') ?? '').trim()
  const reportingType = String(formData.get('reporting_type') ?? '').trim()
  const parentCategoryIdText = String(
    formData.get('parent_category_id') ?? ''
  ).trim()
  const parentCategoryId = parentCategoryIdText || null
  const color = String(formData.get('color') ?? '').trim()
  const icon = String(formData.get('icon') ?? '').trim()
  const excludeFromBudget = formData.get('exclude_from_budget') !== null
  const excludeFromReports = formData.get('exclude_from_reports') !== null
  const sortOrder = parseNullableInteger(formData.get('sort_order'))

  if (!name) {
    fail('Category name is required.')
  }

  if (!isCategoryType(categoryType)) {
    fail('Select a valid category type.')
  }

  if (!isReportingType(reportingType)) {
    fail('Select a valid reporting type.')
  }

  if (!isCompatibleReportingType(categoryType, reportingType)) {
    fail('The reporting type is not compatible with the category type.')
  }

  if (sortOrder === undefined) {
    fail('Sort order must be a whole number.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: householdCategories, error: householdCategoriesError } =
    await supabase
      .from('categories')
      .select(
        'id, parent_category_id, category_type, reporting_type, is_archived'
      )
      .eq('household_id', householdId)
      .is('deleted_at', null)

  if (householdCategoriesError) {
    fail('Could not validate the category hierarchy.')
  }

  validateParentCategory({
    parentCategoryId,
    categoryType,
    reportingType,
    categories: (householdCategories ?? []) as CategoryHierarchyRow[],
  })

  const { error: insertError } = await supabase.from('categories').insert({
    household_id: householdId,
    name,
    category_type: categoryType,
    reporting_type: reportingType,
    parent_category_id: parentCategoryId,
    exclude_from_budget: excludeFromBudget,
    exclude_from_reports: excludeFromReports,
    color: color || null,
    icon: icon || null,
    sort_order: sortOrder,
    created_by: userId,
  })

  if (insertError) {
    fail('Could not create the category. Please check the form and try again.')
  }

  revalidateCategorySurfaces()
  redirect(
    fromOnboarding
      ? '/onboarding/categories?created=1'
      : '/dashboard/categories?created=1'
  )
}

export async function updateCategoryAction(formData: FormData) {
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const categoryType = String(formData.get('category_type') ?? '').trim()
  const reportingType = String(formData.get('reporting_type') ?? '').trim()
  const parentCategoryIdText = String(
    formData.get('parent_category_id') ?? ''
  ).trim()
  const parentCategoryId = parentCategoryIdText || null
  const color = String(formData.get('color') ?? '').trim()
  const icon = String(formData.get('icon') ?? '').trim()
  const excludeFromBudget = formData.get('exclude_from_budget') !== null
  const excludeFromReports = formData.get('exclude_from_reports') !== null
  const sortOrder = parseNullableInteger(formData.get('sort_order'))
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'
  const redirectPath = showArchived
    ? '/dashboard/categories?showArchived=true&updated=1'
    : '/dashboard/categories?updated=1'

  if (!categoryId) {
    redirectWithError('Category is required.')
  }

  if (!name) {
    redirectWithError('Category name is required.')
  }

  if (!isCategoryType(categoryType)) {
    redirectWithError('Select a valid category type.')
  }

  if (!isReportingType(reportingType)) {
    redirectWithError('Select a valid reporting type.')
  }

  if (!isCompatibleReportingType(categoryType, reportingType)) {
    redirectWithError(
      'The reporting type is not compatible with the category type.'
    )
  }

  if (parentCategoryId === categoryId) {
    redirectWithError('A category cannot be its own parent.')
  }

  if (sortOrder === undefined) {
    redirectWithError('Sort order must be a whole number.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, category_type, reporting_type')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category) {
    redirectWithError('Category was not found for this household.')
  }

  const { data: householdCategories, error: householdCategoriesError } =
    await supabase
      .from('categories')
      .select(
        'id, parent_category_id, category_type, reporting_type, is_archived'
      )
      .eq('household_id', householdId)
      .is('deleted_at', null)

  if (householdCategoriesError) {
    redirectWithError('Could not validate the category hierarchy.')
  }

  const hierarchyRows = (householdCategories ?? []) as CategoryHierarchyRow[]

  const { count: allocationCount, error: allocationCountError } = await supabase
    .from('transaction_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('category_id', categoryId)

  if (allocationCountError) {
    redirectWithError('Could not validate category transaction history.')
  }

  if (
    allocationCount &&
    (category.category_type !== categoryType ||
      category.reporting_type !== reportingType)
  ) {
    redirectWithError(
      'Category type and reporting type cannot be changed after the category has transaction history. Rename or archive the category instead.'
    )
  }

  if (
    hierarchyRows.some((row) => row.parent_category_id === categoryId) &&
    (category.category_type !== categoryType ||
      category.reporting_type !== reportingType)
  ) {
    redirectWithError(
      'Category type and reporting type cannot be changed while the category has child categories.'
    )
  }

  validateParentCategory({
    categoryId,
    parentCategoryId,
    categoryType,
    reportingType,
    categories: hierarchyRows,
  })

  const { error: updateError } = await supabase
    .from('categories')
    .update({
      name,
      category_type: categoryType,
      reporting_type: reportingType,
      parent_category_id: parentCategoryId,
      exclude_from_budget: excludeFromBudget,
      exclude_from_reports: excludeFromReports,
      color: color || null,
      icon: icon || null,
      sort_order: sortOrder,
      updated_by: userId,
    })
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)

  if (updateError) {
    redirectWithError(
      'Could not update the category. Please check the form and try again.'
    )
  }

  revalidateCategorySurfaces()
  redirect(redirectPath)
}

export async function reorderCategoriesAction(orderedIds: string[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'No categories to reorder.' }
  }

  if (orderedIds.some((id) => typeof id !== 'string' || !id)) {
    return { error: 'Invalid category list.' }
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: ownedCategories, error: ownedError } = await supabase
    .from('categories')
    .select('id')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('id', orderedIds)

  if (ownedError) {
    return { error: 'Could not verify categories.' }
  }

  const ownedIds = new Set((ownedCategories ?? []).map((category) => category.id))

  if (ownedIds.size !== orderedIds.length) {
    return { error: 'Some categories do not belong to this household.' }
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('categories')
        .update({ sort_order: index, updated_by: userId })
        .eq('id', id)
        .eq('household_id', householdId)
        .is('deleted_at', null)
    )
  )

  if (results.some((result) => result.error)) {
    return { error: 'Could not save the new category order.' }
  }

  revalidateCategorySurfaces()
  return { success: true }
}

/**
 * BR-047 — promote a subcategory back to a top-level category.
 *
 * Only `parent_category_id` is cleared: the category keeps its id, so every
 * `transaction_allocations` / `budget_lines` row pointing at it still resolves,
 * and its type/reporting type are untouched. `sort_order` is reset because the
 * old value was an index among its former siblings, which means nothing in the
 * root list — it re-sorts by name until dragged.
 */
export async function promoteCategoryAction(formData: FormData) {
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!categoryId) {
    redirectWithError('Category is required.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, parent_category_id')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category) {
    redirectWithError('Category was not found for this household.')
  }

  if (!category.parent_category_id) {
    redirectWithError('This category is already a main category.')
  }

  const { error: updateError } = await supabase
    .from('categories')
    .update({
      parent_category_id: null,
      sort_order: null,
      updated_by: userId,
    })
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)

  if (updateError) {
    redirectWithError('Could not move the category to the main level.')
  }

  revalidateCategorySurfaces()

  const redirectParams = new URLSearchParams()
  if (showArchived) redirectParams.set('showArchived', 'true')
  redirectParams.set('promoted', '1')
  redirect(`/dashboard/categories?${redirectParams.toString()}`)
}

export async function archiveCategoryAction(formData: FormData) {
  // Also reused by the onboarding wizard — see createCategoryAction.
  const fromOnboarding = String(formData.get('return_to') ?? '') === 'onboarding'
  const fail: (message: string) => never = (message) =>
    fromOnboarding
      ? redirect(`/onboarding/categories?error=${encodeURIComponent(message)}`)
      : redirectWithError(message)

  const categoryId = String(formData.get('category_id') ?? '').trim()
  const isArchived = String(formData.get('is_archived') ?? '') === 'true'
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!categoryId) {
    fail('Category is required.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category) {
    fail('Category was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('categories')
    .update({
      is_archived: isArchived,
      updated_by: userId,
    })
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)

  if (updateError) {
    fail(
      isArchived
        ? 'Could not archive the category.'
        : 'Could not unarchive the category.'
    )
  }

  revalidateCategorySurfaces()

  if (fromOnboarding) {
    redirect('/onboarding/categories')
  }

  const redirectParams = new URLSearchParams()
  if (showArchived) redirectParams.set('showArchived', 'true')
  redirectParams.set(isArchived ? 'archived' : 'unarchived', '1')
  if (isArchived) redirectParams.set('archived_id', categoryId)
  redirect(`/dashboard/categories?${redirectParams.toString()}`)
}
