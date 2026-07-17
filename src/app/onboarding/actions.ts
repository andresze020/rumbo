'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isActiveCurrency } from '@/lib/currencies'

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
    throw new Error('Could not prepare your profile. Please try again.')
  }

  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({
      name,
      base_currency: baseCurrency,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (householdError) {
    throw new Error('Could not create your household. Please try again.')
  }

  const { error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: household.id,
      user_id: user.id,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    throw new Error('Could not finish household setup. Please try again.')
  }

  const { error: defaultCategoriesError } = await supabase.rpc(
    'create_default_categories_for_household',
    {
      p_household_id: household.id,
    }
  )

  if (defaultCategoriesError) {
    throw new Error('Could not finish household setup. Please try again.')
  }

  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({
      default_household_id: household.id,
    })
    .eq('id', user.id)

  if (updateProfileError) {
    throw new Error('Could not finish household setup. Please try again.')
  }

  redirect('/dashboard')
}
