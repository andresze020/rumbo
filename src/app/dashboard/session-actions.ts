'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signOutAction() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error('Could not sign out. Please try again.')
  }

  // The next person to sign in on this tab must never see a page the Router
  // Cache kept for this one.
  revalidatePath('/', 'layout')
  redirect('/login')
}
