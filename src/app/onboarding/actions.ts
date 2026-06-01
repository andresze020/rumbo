'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createHouseholdAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const baseCurrency = String(formData.get('baseCurrency') ?? 'CAD')
    .trim()
    .toUpperCase()

  if (!name) {
    throw new Error('Household name is required')
  }

  if (!['CAD', 'USD', 'COP'].includes(baseCurrency)) {
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
      display_name: user.user_metadata?.display_name ?? null,
    },
    {
      onConflict: 'id',
    }
  )

  if (profileError) {
    throw new Error(profileError.message)
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
    throw new Error(householdError.message)
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
    throw new Error(memberError.message)
  }

  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({
      default_household_id: household.id,
    })
    .eq('id', user.id)

  if (updateProfileError) {
    throw new Error(updateProfileError.message)
  }

  redirect('/dashboard')
}