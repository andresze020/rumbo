'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_UI_PREFERENCES,
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
  const { supabase, householdId } = await getAuthContext()

  const { error } = await supabase
    .from('households')
    .update({ name })
    .eq('id', householdId)

  if (error) redirectWithError('Could not update household. Please try again.')

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

  const preferences: UiPreferences = {
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

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/transactions')
  redirect('/dashboard/settings?saved=preferences')
}

export async function signOutAllAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}
