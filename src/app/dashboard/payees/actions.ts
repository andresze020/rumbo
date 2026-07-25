'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Postgres unique_violation — hit when a payee name collides with an existing
// one (case/whitespace-insensitive unique index on household_id + lower(name)).
const UNIQUE_VIOLATION = '23505'

function redirectWithError(message: string): never {
  redirect(`/dashboard/payees?error=${encodeURIComponent(message)}`)
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

// Payee names flow into transactions.merchant_name, which the transaction
// list, reports, and CSV history all display — refresh those surfaces too.
function revalidatePayeeSurfaces() {
  revalidatePath('/dashboard/payees')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard')
}

export async function createPayeeAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()

  if (!name) {
    redirectWithError('Payee name is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error: insertError } = await supabase.from('payees').insert({
    household_id: householdId,
    name,
  })

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      redirectWithError(
        `A payee named "${name}" already exists. Use Merge to combine duplicates.`
      )
    }
    redirectWithError('Could not create the payee. Please try again.')
  }

  revalidatePayeeSurfaces()
  redirect('/dashboard/payees?created=1')
}

export async function updatePayeeAction(formData: FormData) {
  const payeeId = String(formData.get('payee_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!payeeId) {
    redirectWithError('Payee is required.')
  }

  if (!name) {
    redirectWithError('Payee name is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: payee, error: payeeError } = await supabase
    .from('payees')
    .select('id')
    .eq('id', payeeId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (payeeError || !payee) {
    redirectWithError('Payee was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('payees')
    .update({ name })
    .eq('id', payeeId)
    .eq('household_id', householdId)

  if (updateError) {
    if (updateError.code === UNIQUE_VIOLATION) {
      redirectWithError(
        `Another payee named "${name}" already exists. Use Merge to combine them.`
      )
    }
    redirectWithError('Could not rename the payee. Please try again.')
  }

  // Keep the denormalized merchant_name (shown in the transaction list/reports)
  // in sync with the new canonical payee name. Payee-linked transactions always
  // mirror the payee name — merchant_name is not edited independently.
  const { error: mirrorError } = await supabase
    .from('transactions')
    .update({ merchant_name: name })
    .eq('household_id', householdId)
    .eq('payee_id', payeeId)

  if (mirrorError) {
    redirectWithError(
      'The payee was renamed but its transactions could not be updated. Refresh and try again.'
    )
  }

  revalidatePayeeSurfaces()
  redirect(
    showArchived
      ? '/dashboard/payees?showArchived=true&updated=1'
      : '/dashboard/payees?updated=1'
  )
}

export async function archivePayeeAction(formData: FormData) {
  const payeeId = String(formData.get('payee_id') ?? '').trim()
  const isArchived = String(formData.get('is_archived') ?? '') === 'true'
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!payeeId) {
    redirectWithError('Payee is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: payee, error: payeeError } = await supabase
    .from('payees')
    .select('id')
    .eq('id', payeeId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (payeeError || !payee) {
    redirectWithError('Payee was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('payees')
    .update({ is_archived: isArchived })
    .eq('id', payeeId)
    .eq('household_id', householdId)

  if (updateError) {
    redirectWithError(
      isArchived ? 'Could not archive the payee.' : 'Could not restore the payee.'
    )
  }

  revalidatePayeeSurfaces()

  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  params.set(isArchived ? 'archived' : 'unarchived', '1')
  if (isArchived) params.set('archived_id', payeeId)
  redirect(`/dashboard/payees?${params.toString()}`)
}

export async function mergePayeesAction(formData: FormData) {
  const sourceIds = formData
    .getAll('source_id')
    .map((value) => String(value).trim())
    .filter(Boolean)
  const targetId = String(formData.get('target_id') ?? '').trim()
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!sourceIds.length) {
    redirectWithError('Select at least one payee to merge.')
  }

  if (!targetId) {
    redirectWithError('Select the payee to merge into.')
  }

  if (sourceIds.includes(targetId)) {
    redirectWithError('The surviving payee cannot also be selected as a duplicate.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: moved, error: mergeError } = await supabase.rpc('merge_payees_bulk', {
    p_household_id: householdId,
    p_source_ids: [...new Set(sourceIds)],
    p_target_id: targetId,
  })

  if (mergeError) {
    redirectWithError('Could not merge the payees. Please try again.')
  }

  revalidatePayeeSurfaces()

  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  params.set('merged', String(moved ?? 0))
  redirect(`/dashboard/payees?${params.toString()}`)
}
