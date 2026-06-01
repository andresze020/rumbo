'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ACCOUNT_TYPES = [
  'cash',
  'checking',
  'savings',
  'credit_card',
  'debt',
  'investment',
  'other',
] as const

type AccountType = (typeof ACCOUNT_TYPES)[number]

function redirectWithError(message: string): never {
  redirect(`/dashboard/accounts?error=${encodeURIComponent(message)}`)
}

function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPES.includes(value as AccountType)
}

function getAccountClass(accountType: AccountType) {
  return accountType === 'credit_card' || accountType === 'debt'
    ? 'liability'
    : 'asset'
}

export async function createAccountAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const accountType = String(formData.get('account_type') ?? '').trim()
  const currencyCode = String(formData.get('currency_code') ?? '')
    .trim()
    .toUpperCase()
  const institutionName = String(formData.get('institution_name') ?? '').trim()
  const lastFour = String(formData.get('last_four') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const includeInNetWorth = formData.get('include_in_net_worth') !== null

  if (!name) {
    redirectWithError('Account name is required.')
  }

  if (!isAccountType(accountType)) {
    redirectWithError('Select a valid account type.')
  }

  if (!currencyCode) {
    redirectWithError('Select a valid currency.')
  }

  if (lastFour && !/^[0-9]{1,4}$/.test(lastFour)) {
    redirectWithError('Last four must be 1 to 4 digits.')
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

  const { data: currency, error: currencyError } = await supabase
    .from('currencies')
    .select('code')
    .eq('code', currencyCode)
    .eq('is_active', true)
    .maybeSingle()

  if (currencyError || !currency) {
    redirectWithError('Select a valid active currency.')
  }

  const { error: insertError } = await supabase.from('accounts').insert({
    household_id: profile.default_household_id,
    name,
    account_type: accountType,
    account_class: getAccountClass(accountType),
    currency_code: currencyCode,
    institution_name: institutionName || null,
    last_four: lastFour || null,
    notes: notes || null,
    include_in_net_worth: includeInNetWorth,
    created_by: user.id,
  })

  if (insertError) {
    redirectWithError(
      'Could not create the account. Please check the form and try again.'
    )
  }

  revalidatePath('/dashboard/accounts')
  redirect('/dashboard/accounts?created=1')
}
