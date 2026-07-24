'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanSupabaseActionError as cleanRpcError } from '@/lib/supabase/errors'
import {
  advanceUntilFuture,
  computeNextRunDate,
  isFrequency,
  todayIsoDate,
} from '@/lib/recurring/shared'

const RECURRING_NAME_MAX_LENGTH = 120

const TRANSACTION_TYPES = ['income', 'expense'] as const
const STATUSES = ['posted', 'pending'] as const
const REVIEW_STATUSES = ['unreviewed', 'reviewed', 'flagged'] as const

type TransactionType = (typeof TRANSACTION_TYPES)[number]
type Status = (typeof STATUSES)[number]
type ReviewStatus = (typeof REVIEW_STATUSES)[number]

function isReviewStatus(value: string): value is ReviewStatus {
  return REVIEW_STATUSES.includes(value as ReviewStatus)
}

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
  const safeReturnTo = returnTo?.startsWith('/dashboard/')
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

// Like parsePositiveNumber but allows 0 (used for the optional transfer cost).
function parseNonNegativeNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (raw === '') return null
  const numberValue = Number(raw)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
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
  // BR-009: the form's payee combobox submits `payee_name`; the RPC normalizes
  // it into `payees` and keeps `merchant_name` in sync.
  const payeeName = String(formData.get('payee_name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim() || undefined
  const addNext = formData.get('add_next') === 'true'
  // BR-023: the tag multi-select submits `tags_present=1` plus one `tag_id` per
  // selected tag. Absent sentinel = the form didn't manage tags (leave as-is).
  const tagsProvided = formData.get('tags_present') !== null
  const tagIds = formData
    .getAll('tag_id')
    .map((value) => String(value).trim())
    .filter(Boolean)
  // Optional recurrence: when set, we also create a recurring template so the
  // entry repeats. Empty string = "Does not repeat".
  const frequency = String(formData.get('frequency') ?? '').trim()
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

  const { data: newTransactionId, error: transactionError } = await supabase.rpc(
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
      p_payee_name: payeeName || null,
    }
  )

  if (transactionError) {
    redirectWithError(
      'Could not create the transaction. Please check the form and try again.'
    )
  }

  // BR-023: attach the selected tags to the just-created transaction. A failure
  // here doesn't undo the (already posted) transaction — surface a soft error.
  if (tagsProvided && newTransactionId) {
    const { error: tagError } = await supabase.rpc('set_transaction_tags', {
      p_transaction_id: newTransactionId as string,
      p_tag_ids: tagIds,
    })
    if (tagError) {
      redirectWithError(
        'Transaction created, but its tags could not be saved. Edit it to add them.'
      )
    }
    revalidatePath('/dashboard/tags')
  }

  // UC-10: if a frequency was chosen, also create a recurring template. The
  // first occurrence was just posted above; the template schedules the rest.
  // Posting subsequent occurrences is manual (via /dashboard/recurring) until
  // the auto-post scheduler ships.
  if (isFrequency(frequency)) {
    const { data: account } = await supabase
      .from('accounts')
      .select('currency_code')
      .eq('id', accountId)
      .eq('household_id', profile.default_household_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!account) {
      redirectWithError(
        'Transaction created, but the recurring schedule could not be saved (account not found). You can add it under Recurring.'
      )
    }

    // First occurrence = the transaction date we just posted; schedule the next
    // occurrence after it, skipping any that would already be in the past.
    const today = todayIsoDate()
    const firstNext = computeNextRunDate(transactionDate, frequency)
    const nextRunDate =
      firstNext > today ? firstNext : advanceUntilFuture(firstNext, frequency, today)
    const recurringName = (description || merchantName || payeeName || `Recurring ${transactionType}`).slice(
      0,
      RECURRING_NAME_MAX_LENGTH
    )

    // BR-009: carry the payee onto the generated template so its future
    // occurrences post with the same payee as this first one.
    let recurringPayeeId: string | null = null
    if (payeeName) {
      const { data: resolvedPayeeId } = await supabase.rpc('get_or_create_payee', {
        p_household_id: profile.default_household_id,
        p_name: payeeName,
      })
      recurringPayeeId = (resolvedPayeeId as string | null) ?? null
    }

    const { error: recurringError } = await supabase.from('recurring_transactions').insert({
      household_id: profile.default_household_id,
      name: recurringName,
      transaction_type: transactionType,
      account_id: accountId,
      category_id: categoryId,
      payee_id: recurringPayeeId,
      amount,
      currency_code: account.currency_code,
      frequency,
      start_date: transactionDate,
      end_date: null,
      next_run_date: nextRunDate,
      auto_post: false,
      is_active: true,
      created_by: user.id,
    })

    if (recurringError) {
      redirectWithError(
        'Transaction created, but the recurring schedule could not be saved. You can add it under Recurring.'
      )
    }

    revalidatePath('/dashboard/recurring')
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')

  if (addNext) {
    const base = returnTo?.startsWith('/dashboard/') ? returnTo : '/dashboard/transactions'
    const url = new URL(base, 'http://localhost')
    url.searchParams.set('created', '1')
    url.searchParams.set('next_date', transactionDate)
    url.searchParams.set('next_type', transactionType)
    if (accountId) url.searchParams.set('next_account', accountId)
    if (status) url.searchParams.set('next_status', status)
    // Unique per redirect so the dialog reopen effect fires even when the
    // next entry reuses the same date/type/account as the previous one.
    url.searchParams.set('next_seq', String(Date.now()))
    redirect(`${url.pathname}?${url.searchParams.toString()}`)
  }

  redirectWithTransactionInfo('created', returnTo)
}

export async function createTransferTransactionAction(formData: FormData) {
  const fromAccountId = String(formData.get('from_account_id') ?? '').trim()
  const toAccountId = String(formData.get('to_account_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const transactionDate = String(formData.get('transaction_date') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim() || undefined
  const exchangeRateToBaseRaw = String(formData.get('exchange_rate_to_base') ?? '').trim()
  const exchangeRateToBase = Number(exchangeRateToBaseRaw)
  const validExchangeRate =
    exchangeRateToBaseRaw !== '' && Number.isFinite(exchangeRateToBase) && exchangeRateToBase > 0
      ? exchangeRateToBase
      : 1
  // BR-007: destination amount (to-account currency) for cross-currency
  // transfers; null for same-currency transfers.
  const toAmount = parsePositiveNumber(formData.get('to_amount'))
  // Unified transfer cost (FX spread + fee) in base currency + its category.
  const costBase = parseNonNegativeNumber(formData.get('cost_base'))
  const costCategoryId = String(formData.get('cost_category_id') ?? '').trim() || null

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
      p_exchange_rate_to_base: validExchangeRate,
      p_to_amount: toAmount,
      p_cost_base: costBase,
      p_cost_category_id: costCategoryId,
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
  redirectWithTransactionInfo('created', returnTo)
}

export async function updateManualTransactionAction(formData: FormData) {
  const transactionId = String(formData.get('transaction_id') ?? '').trim()
  const transactionDate = String(formData.get('transaction_date') ?? '').trim()
  const accountId = String(formData.get('account_id') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const amount = parsePositiveNumber(formData.get('amount'))
  const description = String(formData.get('description') ?? '').trim()
  const merchantName = String(formData.get('merchant_name') ?? '').trim()
  // BR-009: distinguish "form omitted the payee field" (legacy caller → leave
  // payee_id untouched) from "field present but empty" (user cleared it).
  const rawPayee = formData.get('payee_name')
  const payeeProvided = rawPayee !== null
  const payeeName = String(rawPayee ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim()
  // BR-023: only touch tags when the form managed them (edit form), so the
  // inline quick-edit (which has no tag field) never wipes a transaction's tags.
  const tagsProvided = formData.get('tags_present') !== null
  const tagIds = formData
    .getAll('tag_id')
    .map((value) => String(value).trim())
    .filter(Boolean)

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
      p_payee_name: payeeProvided ? payeeName : null,
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

  // BR-023: replace the transaction's tag set with the form's selection.
  if (tagsProvided) {
    const { error: tagError } = await supabase.rpc('set_transaction_tags', {
      p_transaction_id: transactionId,
      p_tag_ids: tagIds,
    })
    if (tagError) {
      redirectWithTransactionError(
        'Transaction saved, but its tags could not be updated. Try again.',
        returnTo
      )
    }
    revalidatePath('/dashboard/tags')
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
  const exchangeRateToBase = parsePositiveNumber(formData.get('exchange_rate_to_base'))
  // BR-007: destination amount (in the to-account currency) for cross-currency
  // transfers; null for same-currency transfers.
  const toAmount = parsePositiveNumber(formData.get('to_amount'))
  // Unified transfer cost (FX spread + fee) in base currency + its category.
  const costBase = parseNonNegativeNumber(formData.get('cost_base'))
  const costCategoryId = String(formData.get('cost_category_id') ?? '').trim() || null

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
      p_exchange_rate_to_base: exchangeRateToBase ?? 1,
      p_to_amount: toAmount,
      p_cost_base: costBase,
      p_cost_category_id: costCategoryId,
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

  // BR-015: capture the posting status before voiding so the "Undo" toast can
  // restore the transaction to exactly what it was (posted vs pending). The
  // void RPC overwrites status with 'voided' and doesn't record the prior one.
  const { data: priorRow } = await supabase
    .from('transactions')
    .select('status')
    .eq('id', transactionId)
    .maybeSingle()
  const restoreStatus =
    priorRow?.status === 'pending' ? 'pending' : 'posted'

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
  redirect(
    `/dashboard/transactions?voided=1&undo_id=${encodeURIComponent(transactionId)}&undo_status=${restoreStatus}`
  )
}

export async function unvoidTransactionAction(formData: FormData) {
  const transactionId = String(formData.get('transaction_id') ?? '').trim()
  const restoreStatus = String(formData.get('restore_status') ?? '').trim() || 'posted'

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

  const { error: transactionError } = await supabase.rpc('unvoid_transaction', {
    p_transaction_id: transactionId,
    p_restore_status: restoreStatus,
  })

  if (transactionError) {
    redirectWithError(
      cleanRpcError(
        transactionError.message,
        'Could not restore the transaction. Please try again.'
      )
    )
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  redirect('/dashboard/transactions?unvoided=1')
}

// ── Sprint 4: review workflow + bulk editing ────────────────────────────────
// review_status is a workflow flag only. It is independent from the posting
// `status` and never affects balances or reports, so it is updated directly
// (under RLS) rather than through a ledger RPC.

export async function updateReviewStatusAction(formData: FormData) {
  const transactionIds = formData
    .getAll('transaction_id')
    .map((value) => String(value).trim())
    .filter(Boolean)
  const reviewStatus = String(formData.get('review_status') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim()

  if (transactionIds.length === 0) {
    redirectWithTransactionError('Select at least one transaction.', returnTo)
  }

  if (!isReviewStatus(reviewStatus)) {
    redirectWithTransactionError('Invalid review status.', returnTo)
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

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ review_status: reviewStatus, updated_by: user.id })
    .eq('household_id', profile.default_household_id)
    .in('id', transactionIds)
    .is('deleted_at', null)

  if (updateError) {
    redirectWithTransactionError(
      'Could not update the review status. Please try again.',
      returnTo
    )
  }

  revalidatePath('/dashboard/transactions')
  redirectWithTransactionInfo('updated', returnTo)
}

export async function bulkCategorizeAction(formData: FormData) {
  const transactionIds = formData
    .getAll('transaction_id')
    .map((value) => String(value).trim())
    .filter(Boolean)
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '').trim()

  if (transactionIds.length === 0) {
    redirectWithTransactionError('Select at least one transaction.', returnTo)
  }

  if (!categoryId) {
    redirectWithTransactionError('Select a category.', returnTo)
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

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, category_type')
    .eq('id', categoryId)
    .eq('household_id', profile.default_household_id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .maybeSingle()

  if (categoryError || !category) {
    redirectWithTransactionError(
      'Select an active category for this household.',
      returnTo
    )
  }

  if (category.category_type !== 'income' && category.category_type !== 'expense') {
    redirectWithTransactionError(
      'Bulk categorize only supports income and expense categories.',
      returnTo
    )
  }

  // Only transactions whose type matches the category type are eligible, so an
  // expense category never lands on an income transaction (and vice versa).
  // Voided/deleted transactions are skipped.
  const { data: eligible, error: eligibleError } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', profile.default_household_id)
    .in('id', transactionIds)
    .eq('transaction_type', category.category_type)
    .not('status', 'in', '(voided,deleted_soft)')
    .is('deleted_at', null)

  if (eligibleError) {
    redirectWithTransactionError(
      'Could not categorize the selected transactions. Please try again.',
      returnTo
    )
  }

  const eligibleIds = (eligible ?? []).map((row) => row.id)

  if (eligibleIds.length === 0) {
    redirectWithTransactionError(
      'None of the selected transactions can use this category.',
      returnTo
    )
  }

  // Classification only — amounts and entries are untouched, so balances stay
  // correct and reports/budgets re-derive from the new allocation category.
  const { error: allocationError } = await supabase
    .from('transaction_allocations')
    .update({ category_id: categoryId })
    .eq('household_id', profile.default_household_id)
    .in('transaction_id', eligibleIds)
    .eq('allocation_type', category.category_type)

  if (allocationError) {
    redirectWithTransactionError(
      'Could not categorize the selected transactions. Please try again.',
      returnTo
    )
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/budgets')
  redirectWithTransactionInfo('updated', returnTo)
}
