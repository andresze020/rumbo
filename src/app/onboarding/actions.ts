'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isActiveCurrency } from '@/lib/currencies'

// Once the first setup write has run, a later failure leaves part of the
// household behind: purge the Router Cache before failing (RUM-005).
function failSetup(message: string): never {
  revalidatePath('/', 'layout')
  throw new Error(message)
}

export async function createHouseholdAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const baseCurrency = String(formData.get('baseCurrency') ?? 'CAD')
    .trim()
    .toUpperCase()

  if (!name) {
    throw new Error('Household name is required')
  }

  if (!(await isActiveCurrency(baseCurrency))) {
    throw new Error('Invalid base currency')
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      display_name: user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? null,
    },
    {
      onConflict: 'id',
    }
  )

  if (profileError) {
    failSetup('Could not prepare your profile. Please try again.')
  }

  // HH-0: the household, its owner membership, the default categories and
  // this profile's default_household_id in ONE call — one transaction, so a
  // failure leaves nothing half-built. Clients can no longer insert into
  // households or household_members directly.
  const { error: householdError } = await supabase.rpc('create_household_with_owner', {
    p_name: name,
    p_base_currency: baseCurrency,
  })

  if (householdError) {
    failSetup('Could not create your household. Please try again.')
  }

  // A new household changes every page: drop anything the Router Cache kept.
  revalidatePath('/', 'layout')
  redirect('/onboarding/account')
}
