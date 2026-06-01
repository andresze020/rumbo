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

function redirectWithInfo(message: string): never {
  redirect(`/dashboard/accounts?info=${encodeURIComponent(message)}`)
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

export async function setOpeningBalanceAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '').trim()
  const openingBalanceDate = String(
    formData.get('opening_balance_date') ?? ''
  ).trim()
  const amountText = String(
    formData.get('opening_balance_amount') ?? ''
  ).trim()
  const amount = Number(amountText)
  const exchangeRateToBase = Number(
    String(formData.get('exchange_rate_to_base') ?? '1').trim()
  )
  const notes = String(formData.get('notes') ?? '').trim()

  if (!accountId) {
    redirectWithError('Account is required.')
  }

  if (!amountText || amount === 0) {
    revalidatePath('/dashboard/accounts')
    revalidatePath('/dashboard')
    redirectWithInfo('No opening balance was created because the account starts at 0.')
  }

  if (!Number.isFinite(amount)) {
    redirectWithError('Opening balance amount must be a valid number.')
  }

  if (!openingBalanceDate) {
    redirectWithError('Opening balance date is required.')
  }

  if (!Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0) {
    redirectWithError('Exchange rate must be greater than 0.')
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

  const { error: openingBalanceError } = await supabase.rpc(
    'create_opening_balance',
    {
      p_household_id: profile.default_household_id,
      p_account_id: accountId,
      p_opening_balance_amount: amount,
      p_opening_balance_date: openingBalanceDate,
      p_exchange_rate_to_base: exchangeRateToBase,
      p_notes: notes || null,
    }
  )

  if (openingBalanceError) {
    redirectWithError(
      openingBalanceError.message.includes(
        'Opening balance already exists for this account'
      )
        ? 'Opening balance already exists for this account.'
        : openingBalanceError.message.includes(
              'Opening balance amount cannot be 0'
            )
          ? 'Leave the opening balance blank or enter 0 when the account starts at zero.'
        : 'Could not set the opening balance. Please check the form and try again.'
    )
  }

  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  redirect('/dashboard/accounts?openingBalanceSet=1')
}
