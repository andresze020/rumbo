'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanSupabaseActionError as cleanRpcError } from '@/lib/supabase/errors'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DESCRIPTION = 200

function redirectWithError(message: string): never {
  redirect(`/dashboard/installments?error=${encodeURIComponent(message)}`)
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? '').trim())
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null
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
    userId: user.id,
    householdId: profile.default_household_id as string,
  }
}

/**
 * Every surface an installment plan touches. The plan generates N ordinary
 * expense transactions, so the transaction list, the account balances and the
 * dashboard all change — there is no separate "installments only" view of the
 * money.
 */
function revalidateInstallmentSurfaces() {
  revalidatePath('/dashboard/installments')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard')
}

export async function createInstallmentPlanAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const totalAmount = parsePositiveNumber(formData.get('total_amount'))
  const installmentCountRaw = String(formData.get('installment_count') ?? '').trim()
  const startDate = String(formData.get('start_date') ?? '').trim()
  const payeeName = String(formData.get('payee_name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  // Same rate convention as the transaction form: the user types how many
  // account-currency units make up 1 base unit, so the stored rate is its
  // reciprocal.
  const rateBaseToAccount = parsePositiveNumber(formData.get('rate_base_to_account'))

  if (!accountId) {
    redirectWithError('Select the account this purchase is charged to.')
  }
  if (!categoryId) {
    redirectWithError('Select a category.')
  }
  if (!description) {
    redirectWithError('Describe what the purchase is.')
  }
  if (description.length > MAX_DESCRIPTION) {
    redirectWithError(`The description must be ${MAX_DESCRIPTION} characters or fewer.`)
  }
  if (totalAmount === null) {
    redirectWithError('The total must be greater than 0.')
  }

  const installmentCount = Number(installmentCountRaw)
  if (
    !Number.isInteger(installmentCount) ||
    installmentCount < 2 ||
    installmentCount > 60
  ) {
    redirectWithError('The number of installments must be a whole number between 2 and 60.')
  }

  if (!ISO_DATE.test(startDate)) {
    redirectWithError('The date of the first installment is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const exchangeRateToBase = rateBaseToAccount !== null ? 1 / rateBaseToAccount : 1

  // One RPC writes the plan and all N installments together, so a partial plan
  // cannot exist.
  const { error } = await supabase.rpc('create_installment_plan', {
    p_household_id: householdId,
    p_account_id: accountId,
    p_category_id: categoryId,
    p_total_amount: totalAmount,
    p_installment_count: installmentCount,
    p_start_date: startDate,
    p_description: description,
    p_payee_name: payeeName || null,
    p_notes: notes || null,
    p_exchange_rate_to_base: exchangeRateToBase,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(
        error.message,
        'Could not create the installment plan. Please check the form and try again.'
      )
    )
  }

  revalidateInstallmentSurfaces()
  redirect('/dashboard/installments?created=1')
}

/**
 * Early payoff, or a plan entered by mistake. Voids only the installments that
 * have not come due yet — the ones already billed are real history. The plan is
 * marked `cancelled`, never deleted.
 */
export async function cancelInstallmentPlanAction(formData: FormData) {
  const planId = String(formData.get('plan_id') ?? '').trim()

  if (!planId) {
    redirectWithError('Installment plan is required.')
  }

  const { supabase } = await getAuthenticatedHousehold()

  const { data: voidedCount, error } = await supabase.rpc('cancel_installment_plan', {
    p_plan_id: planId,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(error.message, 'Could not cancel the installment plan.')
    )
  }

  revalidateInstallmentSurfaces()
  redirect(
    `/dashboard/installments?cancelled=1&voided=${encodeURIComponent(
      String(Number(voidedCount ?? 0))
    )}`
  )
}
