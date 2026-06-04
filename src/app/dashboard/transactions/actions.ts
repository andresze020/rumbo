'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanSupabaseActionError as cleanRpcError } from '@/lib/supabase/errors'

const TRANSACTION_TYPES = ['income', 'expense'] as const
const STATUSES = ['posted', 'pending'] as const

type TransactionType = (typeof TRANSACTION_TYPES)[number]
type Status = (typeof STATUSES)[number]

function redirectWithError(message: string): never {
  redirect(`/dashboard/transactions?error=${encodeURIComponent(message)}`)
}

function redirectWithTransactionError(message: string, returnTo?: string): never {
  redirect(addQueryParam(returnTo, 'error', message))
}

function redirectWithTransactionInfo(name: string, returnTo?: string): never {
  redirect(addQueryParam(returnTo, name, '1'))
}

function addQueryParam(returnTo: string | undefined, name: string, value: string) {
  const safeReturnTo = returnTo?.startsWith('/dashboard/transactions')
    ? returnTo
    : '/dashboard/transactions'
  const url = new URL(safeReturnTo, 'http://localhost')

  url.searchParams.set(name, value)

  return `${url.pathname}?${url.searchParams.toString()}`
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
  const rateBaseToAccount = parsePositiveNumber(formData.get('rate_base_to_account'))
  const legacyRate = parsePositiveNumber(formData.get('exchange_rate_to_base'))
  const exchangeRateToBase =
    rateBaseToAccount !== null
      ? 1 / rateBaseToAccount
      : (legacyRate ?? 1)

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

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, category_type')
    .eq('id', categoryId)
    .eq('household_id', profile.default_household_id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category) {
    redirectWithError('Select an active category for this household.')
  }

  if (category.category_type !== transactionType) {
    redirectWithError(
      transactionType === 'income'
        ? 'Income transactions require an income category.'
        : 'Expense transactions require an expense category.'
    )
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

export async function createTransferTransactionAction(formData: FormData) {
  const fromAccountId = String(formData.get('from_account_id') ?? '').trim()
  const toAccountId = String(formData.get('to_account_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const transactionDate = String(formData.get('transaction_date') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()

  if (!fromAccountId) {
    redirectWithError('Select the source account.')
  }

  if (!toAccountId) {
    redirectWithError('Select the destination account.')
  }

  if (fromAccountId === toAccountId) {
    redirectWithError('Source and destination accounts must be different.')
  }

  if (amount === null) {
    redirectWithError('Amount must be greater than 0.')
  }

  if (!transactionDate) {
    redirectWithError('Transaction date is required.')
  }

  if (!isStatus(status)) {
    redirectWithError('Select posted or pending status.')
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
    'create_transfer_transaction',
    {
      p_household_id: profile.default_household_id,
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_amount: amount,
      p_transaction_date: transactionDate,
      p_description: description || null,
      p_notes: notes || null,
      p_status: status,
    }
  )

  if (transactionError) {
    redirectWithError(
      cleanRpcError(
        transactionError.message,
        'Could not create the transfer. Please check the form and try again.'
      )
    )
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  redirect('/dashboard/transactions?created=1')
}

export async function updateManualTransactionAction(formData: FormData) {
  const transactionId = String(formData.get('transaction_id') ?? '').trim()
  const transactionDate = String(formData.get('transaction_date') ?? '').trim()
  const accountId = String(formData.get('account_id') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const description = String(formData.get('description') ?? '').trim()
  const merchantName = String(formData.get('merchant_name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim()

  if (!transactionId) {
    redirectWithTransactionError('Transaction id is required.', returnTo)
  }

  if (!transactionDate) {
    redirectWithTransactionError('Transaction date is required.', returnTo)
  }

  if (!accountId) {
    redirectWithTransactionError('Select an account.', returnTo)
  }

  if (!categoryId) {
    redirectWithTransactionError('Select a category.', returnTo)
  }

  if (amount === null) {
    redirectWithTransactionError('Amount must be greater than 0.', returnTo)
  }

  if (!isStatus(status)) {
    redirectWithTransactionError('Select posted or pending status.', returnTo)
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
    redirectWithTransactionError('Could not load your household.', returnTo)
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  const { error: transactionError } = await supabase.rpc(
    'update_manual_transaction',
    {
      p_transaction_id: transactionId,
      p_account_id: accountId,
      p_category_id: categoryId,
      p_amount: amount,
      p_transaction_date: transactionDate,
      p_description: description || null,
      p_merchant_name: merchantName || null,
      p_notes: notes || null,
      p_status: status,
    }
  )

  if (transactionError) {
    redirectWithTransactionError(
      cleanRpcError(
        transactionError.message,
        'Could not update the transaction. Please check the form and try again.'
      ),
      returnTo
    )
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  redirectWithTransactionInfo('updated', returnTo)
}

export async function updateTransferTransactionAction(formData: FormData) {
  const transactionId = String(formData.get('transaction_id') ?? '').trim()
  const fromAccountId = String(formData.get('from_account_id') ?? '').trim()
  const toAccountId = String(formData.get('to_account_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const transactionDate = String(formData.get('transaction_date') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim()

  if (!transactionId) {
    redirectWithTransactionError('Transaction id is required.', returnTo)
  }

  if (!fromAccountId) {
    redirectWithTransactionError('Select the source account.', returnTo)
  }

  if (!toAccountId) {
    redirectWithTransactionError('Select the destination account.', returnTo)
  }

  if (fromAccountId === toAccountId) {
    redirectWithTransactionError(
      'Source and destination accounts must be different.',
      returnTo
    )
  }

  if (amount === null) {
    redirectWithTransactionError('Amount must be greater than 0.', returnTo)
  }

  if (!transactionDate) {
    redirectWithTransactionError('Transaction date is required.', returnTo)
  }

  if (!isStatus(status)) {
    redirectWithTransactionError('Select posted or pending status.', returnTo)
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
    redirectWithTransactionError('Could not load your household.', returnTo)
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  const { error: transactionError } = await supabase.rpc(
    'update_transfer_transaction',
    {
      p_transaction_id: transactionId,
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_amount: amount,
      p_transaction_date: transactionDate,
      p_description: description || null,
      p_notes: notes || null,
      p_status: status,
    }
  )

  if (transactionError) {
    redirectWithTransactionError(
      cleanRpcError(
        transactionError.message,
        'Could not update the transfer. Please check the form and try again.'
      ),
      returnTo
    )
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  redirectWithTransactionInfo('updated', returnTo)
}

export async function voidTransactionAction(formData: FormData) {
  const transactionId = String(formData.get('transaction_id') ?? '').trim()
  const voidReason = String(formData.get('void_reason') ?? '').trim()

  if (!transactionId) {
    redirectWithError('Transaction id is required.')
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { error: transactionError } = await supabase.rpc('void_transaction', {
    p_transaction_id: transactionId,
    p_void_reason: voidReason || null,
  })

  if (transactionError) {
    redirectWithError(
      cleanRpcError(
        transactionError.message,
        'Could not void the transaction. Please try again.'
      )
    )
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  redirect('/dashboard/transactions?voided=1')
}
