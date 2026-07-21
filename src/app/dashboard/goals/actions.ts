'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isGoalStatus, isGoalType } from '@/lib/goals/shared'
import { cleanSupabaseActionError } from '@/lib/supabase/errors'

const MAX_NAME_LENGTH = 120

function redirectWithError(message: string): never {
  redirect(`/dashboard/goals?error=${encodeURIComponent(message)}`)
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? '').trim())
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null
  }
  return numberValue
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
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

function revalidateGoalsSurfaces() {
  revalidatePath('/dashboard/goals')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/plan')
}

type ValidatedGoal = {
  name: string
  goalType: string
  targetAmount: number
  currencyCode: string
  targetDate: string | null
  linkedAccountId: string | null
}

/** Shared field parsing + validation for create/update. Verifies the linked
 * account (if any) belongs to the household and is active. */
async function parseAndValidateGoal(
  supabase: Awaited<ReturnType<typeof getAuthenticatedHousehold>>['supabase'],
  householdId: string,
  formData: FormData
): Promise<ValidatedGoal> {
  const name = String(formData.get('name') ?? '').trim()
  const goalType = String(formData.get('goal_type') ?? '').trim()
  const targetAmount = parsePositiveNumber(formData.get('target_amount'))
  const currencyCode = String(formData.get('currency_code') ?? '').trim().toUpperCase()
  const targetDateRaw = String(formData.get('target_date') ?? '').trim()
  const targetDate = targetDateRaw || null
  const linkedAccountIdRaw = String(formData.get('linked_account_id') ?? '').trim()
  const linkedAccountId = linkedAccountIdRaw || null

  if (!name) {
    redirectWithError('Name is required.')
  }
  if (name.length > MAX_NAME_LENGTH) {
    redirectWithError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`)
  }
  if (!isGoalType(goalType)) {
    redirectWithError('Select a valid goal type.')
  }
  if (targetAmount === null) {
    redirectWithError('Target amount must be greater than 0.')
  }
  if (!currencyCode) {
    redirectWithError('Select a currency.')
  }
  if (targetDate && !isIsoDate(targetDate)) {
    redirectWithError('Target date is invalid.')
  }

  if (linkedAccountId) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, is_archived')
      .eq('id', linkedAccountId)
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .maybeSingle()

    if (accountError || !account) {
      redirectWithError('Select an account for this household.')
    }
    if (account.is_archived) {
      redirectWithError('Select an active account.')
    }
  }

  return {
    name,
    goalType,
    targetAmount: targetAmount as number,
    currencyCode,
    targetDate,
    linkedAccountId,
  }
}

export async function createGoalAction(formData: FormData) {
  const { supabase, userId, householdId } = await getAuthenticatedHousehold()
  const g = await parseAndValidateGoal(supabase, householdId, formData)

  const { error: insertError } = await supabase.from('goals').insert({
    household_id: householdId,
    name: g.name,
    goal_type: g.goalType,
    target_amount: g.targetAmount,
    current_amount: 0,
    currency_code: g.currencyCode,
    target_date: g.targetDate,
    linked_account_id: g.linkedAccountId,
    status: 'active',
    created_by: userId,
  })

  if (insertError) {
    redirectWithError('Could not create the goal. Please check the form and try again.')
  }

  revalidateGoalsSurfaces()
  redirect('/dashboard/goals?created=1')
}

export async function updateGoalAction(formData: FormData) {
  const goalId = String(formData.get('goal_id') ?? '').trim()
  if (!goalId) {
    redirectWithError('Goal is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: existing, error: existingError } = await supabase
    .from('goals')
    .select('id, status')
    .eq('id', goalId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (existingError || !existing) {
    redirectWithError('Goal was not found for this household.')
  }

  const g = await parseAndValidateGoal(supabase, householdId, formData)

  const { data: updated, error: updateError } = await supabase
    .from('goals')
    .update({
      name: g.name,
      goal_type: g.goalType,
      target_amount: g.targetAmount,
      currency_code: g.currencyCode,
      target_date: g.targetDate,
      linked_account_id: g.linkedAccountId,
    })
    .eq('id', goalId)
    .eq('household_id', householdId)
    .select('id')

  if (updateError || !updated?.length) {
    redirectWithError('Could not update the goal. Please check the form and try again.')
  }

  revalidateGoalsSurfaces()
  redirect('/dashboard/goals?updated=1')
}

async function applyGoalAdjustment(goalId: string, amountRaw: FormDataEntryValue | null, sign: 1 | -1) {
  const amount = parsePositiveNumber(amountRaw)

  if (!goalId) {
    redirectWithError('Goal is required.')
  }
  if (amount === null) {
    redirectWithError('Amount must be greater than 0.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: rpcData, error } = await supabase
    .rpc('apply_goal_adjustment', {
      p_goal_id: goalId,
      p_household_id: householdId,
      p_delta: sign * (amount as number),
    })
    .single()

  const data = rpcData as { current_amount: number; status: string } | null

  if (error || !data) {
    redirectWithError(
      cleanSupabaseActionError(
        error?.message,
        sign === 1 ? 'Could not add the contribution.' : 'Could not register the withdrawal.'
      )
    )
  }

  revalidateGoalsSurfaces()
  return data.status === 'completed'
}

export async function contributeGoalAction(formData: FormData) {
  const goalId = String(formData.get('goal_id') ?? '').trim()
  const reached = await applyGoalAdjustment(goalId, formData.get('amount'), 1)
  redirect(`/dashboard/goals?contributed=1${reached ? '&completed=1' : ''}`)
}

export async function withdrawGoalAction(formData: FormData) {
  const goalId = String(formData.get('goal_id') ?? '').trim()
  await applyGoalAdjustment(goalId, formData.get('amount'), -1)
  redirect('/dashboard/goals?withdrawn=1')
}

export async function setGoalStatusAction(formData: FormData) {
  const goalId = String(formData.get('goal_id') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()

  if (!goalId) {
    redirectWithError('Goal is required.')
  }
  if (!isGoalStatus(status) || status === 'completed') {
    redirectWithError('Select a valid status.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  // Read the prior status so we can distinguish "archive/restore" (which get the
  // undo toast, BR-015) from plain pause/resume — both of the latter also land
  // on status='active'.
  const { data: existing } = await supabase
    .from('goals')
    .select('status')
    .eq('id', goalId)
    .eq('household_id', householdId)
    .maybeSingle()
  const priorStatus = existing?.status

  const { data: updated, error: updateError } = await supabase
    .from('goals')
    .update({ status })
    .eq('id', goalId)
    .eq('household_id', householdId)
    .select('id')

  if (updateError || !updated?.length) {
    redirectWithError('Could not update the goal status.')
  }

  revalidateGoalsSurfaces()

  if (status === 'archived') {
    redirect(`/dashboard/goals?archived=1&archived_id=${encodeURIComponent(goalId)}`)
  }
  if (status === 'active' && priorStatus === 'archived') {
    redirect('/dashboard/goals?unarchived=1')
  }
  redirect('/dashboard/goals?status_updated=1')
}
