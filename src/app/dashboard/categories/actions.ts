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

export async function createCategoryAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const categoryType = String(formData.get('category_type') ?? '').trim()
  const reportingType = String(formData.get('reporting_type') ?? '').trim()

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

  const { error: insertError } = await supabase.from('categories').insert({
    household_id: profile.default_household_id,
    name,
    category_type: categoryType,
    reporting_type: reportingType,
    exclude_from_budget: false,
    exclude_from_reports: false,
    created_by: user.id,
  })

  if (insertError) {
    redirectWithError(
      'Could not create the category. Please check the form and try again.'
    )
  }

  revalidatePath('/dashboard/categories')
  redirect('/dashboard/categories?created=1')
}
