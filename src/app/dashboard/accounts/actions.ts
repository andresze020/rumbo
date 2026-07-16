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

const ACCOUNT_CLASSES = ['asset', 'liability'] as const

type AccountType = (typeof ACCOUNT_TYPES)[number]
type AccountClass = (typeof ACCOUNT_CLASSES)[number]

function redirectWithError(message: string): never {
  redirect(`/dashboard/accounts?error=${encodeURIComponent(message)}`)
}

function redirectWithInfo(message: string): never {
  redirect(`/dashboard/accounts?info=${encodeURIComponent(message)}`)
}

function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPES.includes(value as AccountType)
}

function isAccountClass(value: string): value is AccountClass {
  return ACCOUNT_CLASSES.includes(value as AccountClass)
}

function getAccountClass(accountType: AccountType) {
  return accountType === 'credit_card' || accountType === 'debt'
    ? 'liability'
    : 'asset'
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

function revalidateAccountSurfaces() {
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard')
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

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

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
    household_id: householdId,
    name,
    account_type: accountType,
    account_class: getAccountClass(accountType),
    currency_code: currencyCode,
    institution_name: institutionName || null,
    last_four: lastFour || null,
    notes: notes || null,
    include_in_net_worth: includeInNetWorth,
    created_by: userId,
  })

  if (insertError) {
    redirectWithError(
      'Could not create the account. Please check the form and try again.'
    )
  }

  revalidatePath('/dashboard/accounts')
  redirect('/dashboard/accounts?created=1')
}

export async function updateAccountAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const accountType = String(formData.get('account_type') ?? '').trim()
  const accountClass = String(formData.get('account_class') ?? '').trim()
  const institutionName = String(formData.get('institution_name') ?? '').trim()
  const lastFour = String(formData.get('last_four') ?? '').trim()
  const color = String(formData.get('color') ?? '').trim()
  const icon = String(formData.get('icon') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const includeInNetWorth = formData.get('include_in_net_worth') !== null
  const sortOrder = parseNullableInteger(formData.get('sort_order'))
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'
  const redirectPath = showArchived
    ? '/dashboard/accounts?showArchived=true&updated=1'
    : '/dashboard/accounts?updated=1'

  if (!accountId) {
    redirectWithError('Account is required.')
  }

  if (!name) {
    redirectWithError('Account name is required.')
  }

  if (!isAccountType(accountType)) {
    redirectWithError('Select a valid account type.')
  }

  if (!isAccountClass(accountClass)) {
    redirectWithError('Select a valid account class.')
  }

  if (lastFour && !/^[0-9]{1,4}$/.test(lastFour)) {
    redirectWithError('Last four must be 1 to 4 digits.')
  }

  if (sortOrder === undefined) {
    redirectWithError('Sort order must be a whole number.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (accountError || !account) {
    redirectWithError('Account was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('accounts')
    .update({
      name,
      account_type: accountType,
      account_class: accountClass,
      institution_name: institutionName || null,
      last_four: lastFour || null,
      color: color || null,
      icon: icon || null,
      include_in_net_worth: includeInNetWorth,
      sort_order: sortOrder,
      notes: notes || null,
      updated_by: userId,
    })
    .eq('id', accountId)
    .eq('household_id', householdId)
    .is('deleted_at', null)

  if (updateError) {
    redirectWithError(
      'Could not update the account. Please check the form and try again.'
    )
  }

  revalidateAccountSurfaces()
  redirect(redirectPath)
}

export async function archiveAccountAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '').trim()
  const isArchived = String(formData.get('is_archived') ?? '') === 'true'
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!accountId) {
    redirectWithError('Account is required.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (accountError || !account) {
    redirectWithError('Account was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('accounts')
    .update({
      is_archived: isArchived,
      updated_by: userId,
    })
    .eq('id', accountId)
    .eq('household_id', householdId)
    .is('deleted_at', null)

  if (updateError) {
    redirectWithError(
      isArchived
        ? 'Could not archive the account.'
        : 'Could not unarchive the account.'
    )
  }

  revalidateAccountSurfaces()

  const redirectParams = new URLSearchParams()
  if (showArchived) redirectParams.set('showArchived', 'true')
  redirectParams.set(isArchived ? 'archived' : 'unarchived', '1')
  if (isArchived) redirectParams.set('archived_id', accountId)
  redirect(`/dashboard/accounts?${redirectParams.toString()}`)
}

export async function reorderAccountsAction(orderedIds: string[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'No accounts to reorder.' }
  }

  if (orderedIds.some((id) => typeof id !== 'string' || !id)) {
    return { error: 'Invalid account list.' }
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  // Verify every id belongs to this household before writing any order.
  const { data: ownedAccounts, error: ownedError } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('id', orderedIds)

  if (ownedError) {
    return { error: 'Could not verify accounts.' }
  }

  const ownedIds = new Set((ownedAccounts ?? []).map((account) => account.id))

  if (ownedIds.size !== orderedIds.length) {
    return { error: 'Some accounts do not belong to this household.' }
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('accounts')
        .update({ sort_order: index, updated_by: userId })
        .eq('id', id)
        .eq('household_id', householdId)
        .is('deleted_at', null)
    )
  )

  if (results.some((result) => result.error)) {
    return { error: 'Could not save the new account order.' }
  }

  revalidateAccountSurfaces()
  return { success: true }
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
  const rateBaseToAccountText = String(
    formData.get('rate_base_to_account') ?? ''
  ).trim()
  const rateBaseToAccount = Number(rateBaseToAccountText)
  const legacyRate = Number(
    String(formData.get('exchange_rate_to_base') ?? '1').trim()
  )
  const exchangeRateToBase =
    rateBaseToAccountText && Number.isFinite(rateBaseToAccount) && rateBaseToAccount > 0
      ? 1 / rateBaseToAccount
      : legacyRate
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

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error: openingBalanceError } = await supabase.rpc(
    'create_opening_balance',
    {
      p_household_id: householdId,
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
