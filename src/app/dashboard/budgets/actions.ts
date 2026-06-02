'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function normalizeMonth(value: FormDataEntryValue | null) {
  const month = String(value ?? '').trim()

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null
  }

  return month
}

function parseNonnegativeAmount(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? '').trim())

  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  return amount
}

function budgetPath(month: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams({ month })

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, value)
  }

  return `/dashboard/budgets?${searchParams.toString()}`
}

function redirectWithError(message: string, month: string | null): never {
  const safeMonth = month ?? new Date().toISOString().slice(0, 7)

  redirect(budgetPath(safeMonth, { error: message }))
}

function cleanRpcError(message: string | undefined, fallback: string) {
  const cleaned = message?.replace(/^ERROR:\s*/i, '').trim()

  return cleaned || fallback
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
    redirectWithError('Could not load your household.', null)
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  return {
    supabase,
    householdId: profile.default_household_id as string,
  }
}

function revalidateBudgetSurfaces() {
  revalidatePath('/dashboard/budgets')
}

export async function createBudgetAction(formData: FormData) {
  const month = normalizeMonth(formData.get('month'))

  if (!month) {
    redirectWithError('Select a valid budget month.', month)
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()
  const { error } = await supabase.rpc('create_monthly_budget', {
    p_household_id: householdId,
    p_budget_month: `${month}-01`,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(error.message, 'Could not create this budget.'),
      month
    )
  }

  revalidateBudgetSurfaces()
  redirect(budgetPath(month, { created: '1' }))
}

export async function upsertBudgetLineAction(formData: FormData) {
  const month = normalizeMonth(formData.get('month'))
  const budgetId = String(formData.get('budget_id') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const plannedAmount = parseNonnegativeAmount(formData.get('planned_amount'))

  if (!month) {
    redirectWithError('Select a valid budget month.', month)
  }

  if (!budgetId) {
    redirectWithError('Create the budget before adding lines.', month)
  }

  if (!categoryId) {
    redirectWithError('Select a category.', month)
  }

  if (plannedAmount === null) {
    redirectWithError('Planned amount must be 0 or greater.', month)
  }

  const { supabase } = await getAuthenticatedHousehold()
  const { error } = await supabase.rpc('upsert_budget_line', {
    p_budget_id: budgetId,
    p_category_id: categoryId,
    p_planned_amount: plannedAmount,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(error.message, 'Could not save this budget line.'),
      month
    )
  }

  revalidateBudgetSurfaces()
  redirect(budgetPath(month, { lineUpdated: '1' }))
}

export async function deleteBudgetLineAction(formData: FormData) {
  const month = normalizeMonth(formData.get('month'))
  const lineId = String(formData.get('line_id') ?? '').trim()

  if (!month) {
    redirectWithError('Select a valid budget month.', month)
  }

  if (!lineId) {
    redirectWithError('Budget line is required.', month)
  }

  const { supabase } = await getAuthenticatedHousehold()
  const { error } = await supabase.rpc('delete_budget_line', {
    p_budget_line_id: lineId,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(error.message, 'Could not remove this budget line.'),
      month
    )
  }

  revalidateBudgetSurfaces()
  redirect(budgetPath(month, { lineRemoved: '1' }))
}

export async function copyPreviousMonthBudgetAction(formData: FormData) {
  const month = normalizeMonth(formData.get('month'))

  if (!month) {
    redirectWithError('Select a valid budget month.', month)
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()
  const { data, error } = await supabase.rpc('copy_budget_from_previous_month', {
    p_household_id: householdId,
    p_budget_month: `${month}-01`,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(error.message, 'Could not copy the previous month budget.'),
      month
    )
  }

  revalidateBudgetSurfaces()
  redirect(budgetPath(month, { copied: String(data ?? 0) }))
}
