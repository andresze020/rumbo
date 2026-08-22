'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_UI_PREFERENCES,
  isTextSize,
  isTransactionPeriod,
  TRANSACTION_FORM_FIELDS,
  type UiPreferences,
} from '@/lib/preferences/shared'

async function getAuthContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) redirect('/onboarding')

  return { supabase, user, householdId: profile.default_household_id as string }
}

function redirectWithError(message: string): never {
  redirect(`/dashboard/settings?error=${encodeURIComponent(message)}`)
}

export async function updateProfileAction(formData: FormData) {
  const displayName = String(formData.get('display_name') ?? '').trim()

  const { supabase, user } = await getAuthContext()

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName || null })
    .eq('id', user.id)

  if (error) redirectWithError('Could not update profile. Please try again.')

  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=profile')
}

export async function updatePasswordAction(formData: FormData) {
  const newPassword = String(formData.get('password') ?? '').trim()
  const confirmPassword = String(formData.get('confirm_password') ?? '').trim()

  if (!newPassword) redirectWithError('New password is required.')
  if (newPassword.length < 8) redirectWithError('Password must be at least 8 characters.')
  if (newPassword !== confirmPassword) redirectWithError('Passwords do not match.')

  const { supabase } = await getAuthContext()
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) redirectWithError('Could not update password. Please try again.')

  redirect('/dashboard/settings?saved=password')
}

export async function updateEmailAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) redirectWithError('New email is required.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirectWithError('Enter a valid email address.')
  }

  const { supabase, user } = await getAuthContext()
  if (email === user.email?.toLowerCase()) {
    redirectWithError('Enter an email address different from your current one.')
  }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) redirectWithError('Could not start the email change. Please try again.')

  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=email')
}

export async function updateHouseholdAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()

  if (!name) redirectWithError('Household name is required.')

  // base_currency is immutable after household creation: every stored
  // amount_base_currency is frozen at the FX rate used when it was written,
  // so changing the base would silently invalidate all balances and reports.
  // Changing it would require a full data migration (re-conversion of every
  // entry), so this action never updates it.
  // BR-036: the day a financial period begins. 1 (the default) is the calendar
  // month and the pre-BR-036 behaviour.
  const monthStartDayRaw = String(formData.get('month_start_day') ?? '').trim()
  const monthStartDay = Number(monthStartDayRaw)

  if (
    monthStartDayRaw !== '' &&
    (!Number.isInteger(monthStartDay) || monthStartDay < 1 || monthStartDay > 31)
  ) {
    redirectWithError('The month start day must be a day of the month, 1 to 31.')
  }

  const { supabase, householdId } = await getAuthContext()

  const { error } = await supabase
    .from('households')
    .update({
      name,
      ...(monthStartDayRaw === '' ? {} : { month_start_day: monthStartDay }),
    })
    .eq('id', householdId)

  if (error) redirectWithError('Could not update household. Please try again.')

  // BR-036: Reports is the only screen that honours it in slice 1.
  revalidatePath('/dashboard/reports')

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=household')
}

/**
 * BR-032 + BR-038 — saves the per-user UI preferences.
 *
 * Checkboxes only appear in the FormData when checked, so each one is read as
 * "present = on". The whole object is rewritten from the submitted form rather
 * than merged, which keeps the stored shape in step with the settings UI; the
 * parser tolerates anything missing.
 */
/**
 * Saves today's exchange rate for one currency pair.
 *
 * The rate is the direct multiplier the ledger uses everywhere else:
 * `1 <from> = rate <base>`. It is written per (pair, date), so saving twice on
 * the same day corrects that day's rate instead of stacking a second row —
 * `exchange_rates_unique_household_pair_date` is the conflict target.
 *
 * This is what makes an account's base-currency equivalent a *current* value
 * rather than the blended historical rate of everything ever posted to it.
 */
export async function saveExchangeRateAction(formData: FormData) {
  const fromCurrency = String(formData.get('from_currency') ?? '').trim().toUpperCase()
  const rateRaw = String(formData.get('rate') ?? '').trim()
  const rateDateRaw = String(formData.get('rate_date') ?? '').trim()

  if (fromCurrency.length !== 3) {
    redirectWithError('Pick the currency to convert from.')
  }

  const rate = Number(rateRaw)

  if (!rateRaw || !Number.isFinite(rate) || rate <= 0) {
    redirectWithError('The exchange rate must be a number greater than 0.')
  }

  if (rateDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(rateDateRaw)) {
    redirectWithError('The rate date must be a valid date.')
  }

  const { supabase, user, householdId } = await getAuthContext()

  const { data: household } = await supabase
    .from('households')
    .select('base_currency')
    .eq('id', householdId)
    .maybeSingle()

  const baseCurrency = household?.base_currency as string | undefined

  if (!baseCurrency) redirectWithError('Could not read the household base currency.')

  if (baseCurrency === fromCurrency) {
    redirectWithError('The base currency does not need a rate against itself.')
  }

  const rateDate = rateDateRaw || new Date().toISOString().slice(0, 10)

  const { error } = await supabase.from('exchange_rates').upsert(
    {
      household_id: householdId,
      from_currency_code: fromCurrency,
      to_currency_code: baseCurrency,
      rate,
      rate_date: rateDate,
      source: 'manual',
      created_by: user.id,
      updated_by: user.id,
    },
    { onConflict: 'household_id,from_currency_code,to_currency_code,rate_date' }
  )

  if (error) redirectWithError('Could not save the exchange rate. Please try again.')

  // Every screen that shows a base-currency figure reads it through
  // get_account_balances, so they all move together.
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard/net-worth')
  revalidatePath('/dashboard/plan')
  revalidatePath('/dashboard/debts')
  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=exchange-rate')
}

export async function updateUiPreferencesAction(formData: FormData) {
  const accountIds = [
    ...new Set(
      formData
        .getAll('default_account_id')
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ]
  const period = String(formData.get('default_period') ?? '')
  const textSize = String(formData.get('text_size') ?? '')

  const preferences: UiPreferences = {
    textSize: isTextSize(textSize) ? textSize : DEFAULT_UI_PREFERENCES.textSize,
    formFields: Object.fromEntries(
      TRANSACTION_FORM_FIELDS.map((field) => [field, formData.get(`field_${field}`) !== null])
    ) as UiPreferences['formFields'],
    transactions: {
      defaultPeriod: isTransactionPeriod(period)
        ? period
        : DEFAULT_UI_PREFERENCES.transactions.defaultPeriod,
      defaultAccountIds: accountIds,
      compactList: formData.get('compact_list') !== null,
      showBalanceAdjustments: formData.get('show_balance_adjustments') !== null,
    },
  }

  const { supabase, user, householdId } = await getAuthContext()

  // A stale default account (archived or from another household) would filter
  // the list down to nothing, so verify every one still belongs here.
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .eq('is_archived', false)
      .in('id', accountIds)

    if ((accounts ?? []).length !== accountIds.length) {
      redirectWithError('Select active accounts from this household.')
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ ui_preferences: preferences })
    .eq('id', user.id)

  if (error) redirectWithError('Could not save your preferences. Please try again.')

  // Text size is read by the dashboard *layout*, not by a page, so a
  // page-level revalidation would leave the new scale unapplied until the next
  // hard reload. Revalidating the layout covers both pages below it too.
  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard/settings?saved=preferences')
}

export async function signOutAllAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}
