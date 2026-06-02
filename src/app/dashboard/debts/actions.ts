'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanSupabaseActionError as cleanRpcError } from '@/lib/supabase/errors'

const DEBT_ACCOUNT_TYPES = ['debt', 'credit_card'] as const
const INTEREST_RATE_PERIODS = ['monthly', 'annual'] as const
const DEBT_STATUSES = ['active', 'inactive'] as const
const PAYMENT_STATUSES = ['posted', 'pending'] as const

type DebtAccountType = (typeof DEBT_ACCOUNT_TYPES)[number]
type InterestRatePeriod = (typeof INTEREST_RATE_PERIODS)[number]
type DebtStatus = (typeof DEBT_STATUSES)[number]
type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

function redirectWithError(message: string): never {
  redirect(`/dashboard/debts?error=${encodeURIComponent(message)}`)
}

function redirectWithInfo(name: string): never {
  redirect(`/dashboard/debts?${name}=1`)
}

function isDebtAccountType(value: string): value is DebtAccountType {
  return DEBT_ACCOUNT_TYPES.includes(value as DebtAccountType)
}

function isInterestRatePeriod(value: string): value is InterestRatePeriod {
  return INTEREST_RATE_PERIODS.includes(value as InterestRatePeriod)
}

function isDebtStatus(value: string): value is DebtStatus {
  return DEBT_STATUSES.includes(value as DebtStatus)
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus)
}

function parseNullableNonnegativeNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()

  if (!text) {
    return null
  }

  const numberValue = Number(text)

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return undefined
  }

  return numberValue
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? '').trim())

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null
  }

  return numberValue
}

function parseNullableDueDay(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()

  if (!text) {
    return null
  }

  const numberValue = Number(text)

  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 31) {
    return undefined
  }

  return numberValue
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
    householdId: profile.default_household_id as string,
  }
}

function revalidateDebtSurfaces() {
  revalidatePath('/dashboard/debts')
  revalidatePath('/dashboard/net-worth')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/budgets')
}

export async function createDebtAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const existingAccountId = String(
    formData.get('existing_account_id') ?? ''
  ).trim()
  const accountType = String(formData.get('account_type') ?? 'debt').trim()
  const currencyCode = String(formData.get('currency_code') ?? '')
    .trim()
    .toUpperCase()
  const openingBalanceAmount = parseNullableNonnegativeNumber(
    formData.get('opening_balance_amount')
  )
  const openingBalanceDate = String(
    formData.get('opening_balance_date') ?? ''
  ).trim()
  const originalPrincipal = parseNullableNonnegativeNumber(
    formData.get('original_principal')
  )
  const interestRate = parseNullableNonnegativeNumber(
    formData.get('interest_rate')
  )
  const interestRatePeriod = String(
    formData.get('interest_rate_period') ?? ''
  ).trim()
  const minimumPayment = parseNullableNonnegativeNumber(
    formData.get('minimum_payment')
  )
  const paymentDueDay = parseNullableDueDay(formData.get('payment_due_day'))
  const lenderName = String(formData.get('lender_name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()

  if (!name) {
    redirectWithError('Debt name is required.')
  }

  if (existingAccountId && !/^[0-9a-f-]{36}$/i.test(existingAccountId)) {
    redirectWithError('Select a valid liability account.')
  }

  if (!existingAccountId && !isDebtAccountType(accountType)) {
    redirectWithError('Select debt or credit card for the account type.')
  }

  if (!existingAccountId && !currencyCode) {
    redirectWithError('Select a currency.')
  }

  if (openingBalanceAmount === undefined) {
    redirectWithError('Opening balance must be 0 or greater.')
  }

  if (originalPrincipal === undefined) {
    redirectWithError('Original principal must be 0 or greater.')
  }

  if (interestRate === undefined) {
    redirectWithError('Interest rate must be 0 or greater.')
  }

  if (
    interestRatePeriod &&
    !isInterestRatePeriod(interestRatePeriod)
  ) {
    redirectWithError('Select monthly or annual for the interest period.')
  }

  if (minimumPayment === undefined) {
    redirectWithError('Minimum payment must be 0 or greater.')
  }

  if (paymentDueDay === undefined) {
    redirectWithError('Payment due day must be between 1 and 31.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error } = await supabase.rpc('create_debt_with_account', {
    p_household_id: householdId,
    p_name: name,
    p_existing_account_id: existingAccountId || null,
    p_account_type: existingAccountId ? null : accountType,
    p_currency_code: existingAccountId ? null : currencyCode,
    p_opening_balance_amount: existingAccountId
      ? null
      : openingBalanceAmount,
    p_opening_balance_date: openingBalanceDate || null,
    p_original_principal: originalPrincipal,
    p_interest_rate: interestRate,
    p_interest_rate_period: interestRatePeriod || null,
    p_minimum_payment: minimumPayment,
    p_payment_due_day: paymentDueDay,
    p_lender_name: lenderName || null,
    p_notes: notes || null,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(
        error.message,
        'Could not create the debt. Please check the form and try again.'
      )
    )
  }

  revalidateDebtSurfaces()
  redirectWithInfo('created')
}

export async function updateDebtAction(formData: FormData) {
  const debtId = String(formData.get('debt_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const originalPrincipal = parseNullableNonnegativeNumber(
    formData.get('original_principal')
  )
  const interestRate = parseNullableNonnegativeNumber(
    formData.get('interest_rate')
  )
  const interestRatePeriod = String(
    formData.get('interest_rate_period') ?? ''
  ).trim()
  const minimumPayment = parseNullableNonnegativeNumber(
    formData.get('minimum_payment')
  )
  const paymentDueDay = parseNullableDueDay(formData.get('payment_due_day'))
  const lenderName = String(formData.get('lender_name') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()

  if (!debtId) {
    redirectWithError('Debt id is required.')
  }

  if (!name) {
    redirectWithError('Debt name is required.')
  }

  if (originalPrincipal === undefined) {
    redirectWithError('Original principal must be 0 or greater.')
  }

  if (interestRate === undefined) {
    redirectWithError('Interest rate must be 0 or greater.')
  }

  if (
    interestRatePeriod &&
    !isInterestRatePeriod(interestRatePeriod)
  ) {
    redirectWithError('Select monthly or annual for the interest period.')
  }

  if (minimumPayment === undefined) {
    redirectWithError('Minimum payment must be 0 or greater.')
  }

  if (paymentDueDay === undefined) {
    redirectWithError('Payment due day must be between 1 and 31.')
  }

  if (!isDebtStatus(status)) {
    redirectWithError('Select active or inactive status.')
  }

  const { supabase } = await getAuthenticatedHousehold()

  const { error } = await supabase.rpc('update_debt_metadata', {
    p_debt_id: debtId,
    p_name: name,
    p_original_principal: originalPrincipal,
    p_interest_rate: interestRate,
    p_interest_rate_period: interestRatePeriod || null,
    p_minimum_payment: minimumPayment,
    p_payment_due_day: paymentDueDay,
    p_lender_name: lenderName || null,
    p_status: status,
    p_notes: notes || null,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(
        error.message,
        'Could not update the debt. Please check the form and try again.'
      )
    )
  }

  revalidateDebtSurfaces()
  redirectWithInfo('updated')
}

export async function createDebtPaymentAction(formData: FormData) {
  const debtId = String(formData.get('debt_id') ?? '').trim()
  const sourceAccountId = String(formData.get('source_account_id') ?? '').trim()
  const paymentDate = String(formData.get('payment_date') ?? '').trim()
  const paymentAmount = parsePositiveNumber(formData.get('payment_amount'))
  const description = String(formData.get('description') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()

  if (!debtId) {
    redirectWithError('Debt id is required.')
  }

  if (!sourceAccountId) {
    redirectWithError('Select a source account.')
  }

  if (!paymentDate) {
    redirectWithError('Payment date is required.')
  }

  if (paymentAmount === null) {
    redirectWithError('Payment amount must be greater than 0.')
  }

  if (!isPaymentStatus(status)) {
    redirectWithError('Select posted or pending status.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error } = await supabase.rpc('create_debt_payment', {
    p_household_id: householdId,
    p_debt_id: debtId,
    p_source_account_id: sourceAccountId,
    p_payment_amount: paymentAmount,
    p_payment_date: paymentDate,
    p_description: description || null,
    p_notes: notes || null,
    p_status: status,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(
        error.message,
        'Could not register the payment. Please check the form and try again.'
      )
    )
  }

  revalidateDebtSurfaces()
  redirectWithInfo('paid')
}
