'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getAuthContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) redirect('/onboarding')

  return { supabase, user, householdId: profile.default_household_id as string }
}

function redirectWithError(message: string): never {
  redirect(`/dashboard/settings?error=${encodeURIComponent(message)}`)
}

export async function updateProfileAction(formData: FormData) {
  const displayName = String(formData.get('display_name') ?? '').trim()

  const { supabase, user } = await getAuthContext()

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName || null })
    .eq('id', user.id)

  if (error) redirectWithError('Could not update profile. Please try again.')

  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=profile')
}

export async function updatePasswordAction(formData: FormData) {
  const newPassword = String(formData.get('password') ?? '').trim()
  const confirmPassword = String(formData.get('confirm_password') ?? '').trim()

  if (!newPassword) redirectWithError('New password is required.')
  if (newPassword.length < 8) redirectWithError('Password must be at least 8 characters.')
  if (newPassword !== confirmPassword) redirectWithError('Passwords do not match.')

  const { supabase } = await getAuthContext()
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) redirectWithError('Could not update password. Please try again.')

  redirect('/dashboard/settings?saved=password')
}

export async function updateEmailAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) redirectWithError('New email is required.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirectWithError('Enter a valid email address.')
  }

  const { supabase, user } = await getAuthContext()
  if (email === user.email?.toLowerCase()) {
    redirectWithError('Enter an email address different from your current one.')
  }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) redirectWithError('Could not start the email change. Please try again.')

  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=email')
}

export async function updateHouseholdAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()

  if (!name) redirectWithError('Household name is required.')

  // base_currency is immutable after household creation: every stored
  // amount_base_currency is frozen at the FX rate used when it was written,
  // so changing the base would silently invalidate all balances and reports.
  // Changing it would require a full data migration (re-conversion of every
  // entry), so this action never updates it.
  const { supabase, householdId } = await getAuthContext()

  const { error } = await supabase
    .from('households')
    .update({ name })
    .eq('id', householdId)

  if (error) redirectWithError('Could not update household. Please try again.')

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=household')
}

export async function signOutAllAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}
