'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanSupabaseActionError as cleanRpcError } from '@/lib/supabase/errors'
import {
  advanceUntilFuture,
  computeNextRunDate,
  isFrequency,
  isRecurringType,
  todayIsoDate,
  type Frequency,
} from '@/lib/recurring/shared'

const MAX_NAME_LENGTH = 120

function redirectWithError(message: string): never {
  redirect(`/dashboard/recurring?error=${encodeURIComponent(message)}`)
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

function revalidateRecurringSurfaces() {
  revalidatePath('/dashboard/recurring')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
}

type ValidatedTemplate = {
  name: string
  transactionType: 'income' | 'expense'
  accountId: string
  categoryId: string
  currencyCode: string
  amount: number
  frequency: Frequency
  startDate: string
  endDate: string | null
}

/** Shared field parsing + validation for create/update. Verifies the account
 * and category belong to the household, are active, and the category type
 * matches the transaction type. Returns the validated values or redirects. */
async function parseAndValidateTemplate(
  supabase: Awaited<ReturnType<typeof getAuthenticatedHousehold>>['supabase'],
  householdId: string,
  formData: FormData
): Promise<ValidatedTemplate> {
  const name = String(formData.get('name') ?? '').trim()
  const transactionType = String(formData.get('transaction_type') ?? '').trim()
  const accountId = String(formData.get('account_id') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const frequency = String(formData.get('frequency') ?? '').trim()
  const startDate = String(formData.get('start_date') ?? '').trim()
  const endDateRaw = String(formData.get('end_date') ?? '').trim()
  const endDate = endDateRaw || null

  if (!name) {
    redirectWithError('Name is required.')
  }
  if (name.length > MAX_NAME_LENGTH) {
    redirectWithError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`)
  }
  if (!isRecurringType(transactionType)) {
    redirectWithError('Select income or expense.')
  }
  if (!accountId) {
    redirectWithError('Select an account.')
  }
  if (!categoryId) {
    redirectWithError('Select a category.')
  }
  if (amount === null) {
    redirectWithError('Amount must be greater than 0.')
  }
  if (!isFrequency(frequency)) {
    redirectWithError('Select a valid frequency.')
  }
  if (!isIsoDate(startDate)) {
    redirectWithError('Start date is required.')
  }
  if (endDate && !isIsoDate(endDate)) {
    redirectWithError('End date is invalid.')
  }
  if (endDate && endDate <= startDate) {
    redirectWithError('End date must be after the start date.')
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, currency_code, is_archived')
    .eq('id', accountId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (accountError || !account) {
    redirectWithError('Select an account for this household.')
  }
  if (account.is_archived) {
    redirectWithError('Select an active account.')
  }

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, category_type')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category) {
    redirectWithError('Select an active category for this household.')
  }
  if (category.category_type !== transactionType) {
    redirectWithError(
      transactionType === 'income'
        ? 'Income templates require an income category.'
        : 'Expense templates require an expense category.'
    )
  }

  return {
    name,
    transactionType,
    accountId,
    categoryId,
    currencyCode: account.currency_code as string,
    amount: amount as number,
    frequency: frequency as Frequency,
    startDate,
    endDate,
  }
}

export async function createRecurringAction(formData: FormData) {
  const { supabase, userId, householdId } = await getAuthenticatedHousehold()
  const t = await parseAndValidateTemplate(supabase, householdId, formData)

  // First occurrence is the start date itself; if it is in the past, advance to
  // the next future occurrence so the template doesn't show a backlog.
  const today = todayIsoDate()
  const nextRunDate =
    t.startDate > today ? t.startDate : advanceUntilFuture(t.startDate, t.frequency, today)

  const { error: insertError } = await supabase.from('recurring_transactions').insert({
    household_id: householdId,
    name: t.name,
    transaction_type: t.transactionType,
    account_id: t.accountId,
    category_id: t.categoryId,
    amount: t.amount,
    currency_code: t.currencyCode,
    frequency: t.frequency,
    start_date: t.startDate,
    end_date: t.endDate,
    next_run_date: nextRunDate,
    auto_post: false,
    is_active: true,
    created_by: userId,
  })

  if (insertError) {
    redirectWithError(
      'Could not create the recurring transaction. Please check the form and try again.'
    )
  }

  revalidateRecurringSurfaces()
  redirect('/dashboard/recurring?created=1')
}

export async function updateRecurringAction(formData: FormData) {
  const recurringId = String(formData.get('recurring_id') ?? '').trim()
  if (!recurringId) {
    redirectWithError('Recurring transaction is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: existing, error: existingError } = await supabase
    .from('recurring_transactions')
    .select('id, start_date, frequency, next_run_date, is_active')
    .eq('id', recurringId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (existingError || !existing) {
    redirectWithError('Recurring transaction was not found for this household.')
  }

  const t = await parseAndValidateTemplate(supabase, householdId, formData)

  // Recompute next_run_date only if the schedule (start date or frequency)
  // changed; otherwise preserve the current cursor.
  const scheduleChanged =
    existing.start_date !== t.startDate || existing.frequency !== t.frequency
  const today = todayIsoDate()
  const nextRunDate = scheduleChanged
    ? t.startDate > today
      ? t.startDate
      : advanceUntilFuture(t.startDate, t.frequency, today)
    : existing.next_run_date

  const { error: updateError } = await supabase
    .from('recurring_transactions')
    .update({
      name: t.name,
      transaction_type: t.transactionType,
      account_id: t.accountId,
      category_id: t.categoryId,
      amount: t.amount,
      currency_code: t.currencyCode,
      frequency: t.frequency,
      start_date: t.startDate,
      end_date: t.endDate,
      next_run_date: nextRunDate,
    })
    .eq('id', recurringId)
    .eq('household_id', householdId)

  if (updateError) {
    redirectWithError(
      'Could not update the recurring transaction. Please check the form and try again.'
    )
  }

  revalidateRecurringSurfaces()
  redirect('/dashboard/recurring?updated=1')
}

export async function toggleRecurringActiveAction(formData: FormData) {
  const recurringId = String(formData.get('recurring_id') ?? '').trim()
  const activate = String(formData.get('activate') ?? '') === 'true'

  if (!recurringId) {
    redirectWithError('Recurring transaction is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: existing, error: existingError } = await supabase
    .from('recurring_transactions')
    .select('id, frequency, end_date')
    .eq('id', recurringId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (existingError || !existing) {
    redirectWithError('Recurring transaction was not found for this household.')
  }

  // On reactivation, recompute next_run_date from today (avoids posting a
  // backlog of missed entries — Open Decision #6).
  const updatePayload: Record<string, unknown> = { is_active: activate }
  if (activate) {
    const today = todayIsoDate()
    if (existing.end_date && existing.end_date < today) {
      redirectWithError('This template has already passed its end date.')
    }
    updatePayload.next_run_date = today
  }

  const { error: updateError } = await supabase
    .from('recurring_transactions')
    .update(updatePayload)
    .eq('id', recurringId)
    .eq('household_id', householdId)

  if (updateError) {
    redirectWithError(
      activate
        ? 'Could not reactivate the recurring transaction.'
        : 'Could not deactivate the recurring transaction.'
    )
  }

  revalidateRecurringSurfaces()
  redirect(`/dashboard/recurring?${activate ? 'reactivated' : 'deactivated'}=1`)
}

export async function deleteRecurringAction(formData: FormData) {
  const recurringId = String(formData.get('recurring_id') ?? '').trim()
  if (!recurringId) {
    redirectWithError('Recurring transaction is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error: deleteError } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', recurringId)
    .eq('household_id', householdId)

  if (deleteError) {
    redirectWithError('Could not delete the recurring transaction.')
  }

  revalidateRecurringSurfaces()
  redirect('/dashboard/recurring?deleted=1')
}

export async function postRecurringAction(formData: FormData) {
  const recurringId = String(formData.get('recurring_id') ?? '').trim()
  const postDate = String(formData.get('post_date') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const notes = String(formData.get('notes') ?? '').trim()
  const rateBaseToAccount = parsePositiveNumber(formData.get('rate_base_to_account'))

  if (!recurringId) {
    redirectWithError('Recurring transaction is required.')
  }
  if (!isIsoDate(postDate)) {
    redirectWithError('Post date is required.')
  }
  if (amount === null) {
    redirectWithError('Amount must be greater than 0.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: template, error: templateError } = await supabase
    .from('recurring_transactions')
    .select(
      'id, name, transaction_type, account_id, category_id, currency_code, frequency, end_date, next_run_date, is_active'
    )
    .eq('id', recurringId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (templateError || !template) {
    redirectWithError('Recurring transaction was not found for this household.')
  }
  if (!template.is_active) {
    redirectWithError('This recurring transaction is inactive.')
  }
  if (!template.account_id || !template.category_id) {
    redirectWithError('This template is missing its account or category. Edit it first.')
  }

  // Verify the account is still active and get its currency for FX handling.
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('currency_code, is_archived')
    .eq('id', template.account_id)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (accountError || !account || account.is_archived) {
    redirectWithError('The template account is archived or unavailable. Edit the template.')
  }

  // Verify the category is still active and matches the type.
  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('category_type')
    .eq('id', template.category_id)
    .eq('household_id', householdId)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category || category.category_type !== template.transaction_type) {
    redirectWithError(
      'The template category is archived or no longer matches its type. Edit the template.'
    )
  }

  const exchangeRateToBase = rateBaseToAccount !== null ? 1 / rateBaseToAccount : 1

  const { error: postError } = await supabase.rpc('create_manual_transaction', {
    p_household_id: householdId,
    p_transaction_type: template.transaction_type,
    p_transaction_date: postDate,
    p_account_id: template.account_id,
    p_category_id: template.category_id,
    p_amount: amount,
    p_description: template.name,
    p_merchant_name: null,
    p_notes: notes || null,
    p_status: 'posted',
    p_exchange_rate_to_base: exchangeRateToBase,
  })

  if (postError) {
    redirectWithError(
      cleanRpcError(
        postError.message,
        'Could not post the transaction. Please check the form and try again.'
      )
    )
  }

  // Advance the schedule one step from the current cursor; auto-deactivate if
  // the new run date passes the end date.
  const cursor = (template.next_run_date as string | null) ?? postDate
  const newNextRunDate = computeNextRunDate(cursor, template.frequency as Frequency)
  const passedEnd = Boolean(template.end_date && newNextRunDate > (template.end_date as string))

  const { error: advanceError } = await supabase
    .from('recurring_transactions')
    .update({
      next_run_date: newNextRunDate,
      is_active: !passedEnd,
    })
    .eq('id', recurringId)
    .eq('household_id', householdId)

  if (advanceError) {
    // The transaction posted successfully; surface a soft warning but don't fail.
    redirect('/dashboard/recurring?posted=1&advance_warning=1')
  }

  revalidateRecurringSurfaces()
  redirect(`/dashboard/recurring?posted=1${passedEnd ? '&completed=1' : ''}`)
}
