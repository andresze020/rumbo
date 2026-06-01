'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const TRANSACTION_TYPES = ['income', 'expense'] as const
const STATUSES = ['posted', 'pending'] as const

type TransactionType = (typeof TRANSACTION_TYPES)[number]
type Status = (typeof STATUSES)[number]

function redirectWithError(message: string): never {
  redirect(`/dashboard/transactions?error=${encodeURIComponent(message)}`)
}

function isTransactionType(value: string): value is TransactionType {
  return TRANSACTION_TYPES.includes(value as TransactionType)
}

function isStatus(value: string): value is Status {
  return STATUSES.includes(value as Status)
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? '').trim())

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null
  }

  return numberValue
}

export async function createManualTransactionAction(formData: FormData) {
  const transactionType = String(formData.get('transaction_type') ?? '').trim()
  const transactionDate = String(formData.get('transaction_date') ?? '').trim()
  const accountId = String(formData.get('account_id') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const description = String(formData.get('description') ?? '').trim()
  const merchantName = String(formData.get('merchant_name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const exchangeRateToBase = parsePositiveNumber(
    formData.get('exchange_rate_to_base')
  )

  if (!isTransactionType(transactionType)) {
    redirectWithError('Select income or expense.')
  }

  if (!transactionDate) {
    redirectWithError('Transaction date is required.')
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

  if (!isStatus(status)) {
    redirectWithError('Select posted or pending status.')
  }

  if (exchangeRateToBase === null) {
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

  const { error: transactionError } = await supabase.rpc(
    'create_manual_transaction',
    {
      p_household_id: profile.default_household_id,
      p_transaction_type: transactionType,
      p_transaction_date: transactionDate,
      p_account_id: accountId,
      p_category_id: categoryId,
      p_amount: amount,
      p_description: description || null,
      p_merchant_name: merchantName || null,
      p_notes: notes || null,
      p_status: status,
      p_exchange_rate_to_base: exchangeRateToBase,
    }
  )

  if (transactionError) {
    redirectWithError(
      'Could not create the transaction. Please check the form and try again.'
    )
  }

  revalidatePath('/dashboard/transactions')
  redirect('/dashboard/transactions?created=1')
}
